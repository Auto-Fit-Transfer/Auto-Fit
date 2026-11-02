"""Controlled two-session checks in an isolated Docker PostgreSQL container.

Load tests/support/autofit_schema.mjs into a fresh container first. This runner
accepts only the dedicated container name; it has no remote connection option.
It creates only random synthetic users and rolls back test transactions on exit.
"""
import concurrent.futures
import json
import queue
import subprocess
import threading
import time
from uuid import uuid4

CONTAINER = 'autofit-community-check-20261014'


class Session:
    def __init__(self):
        self.process = subprocess.Popen(
            ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt',
             '-h', '/tmp', '-U', 'postgres', '-d', 'postgres'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1)
        self.lines = queue.Queue()
        threading.Thread(target=self.read, daemon=True).start()
        self.pid = int(self.execute('select pg_backend_pid()')[1][0])
        self.execute("set statement_timeout = '12s'; set deadlock_timeout = '250ms'")

    def read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip())

    def execute(self, sql):
        marker = 'end_' + uuid4().hex
        self.process.stdin.write(sql + ';\n\\echo state_:SQLSTATE\n\\echo ' + marker + '\n')
        self.process.stdin.flush()
        lines = []
        while True:
            line = self.lines.get(timeout=20)
            if line == marker:
                break
            lines.append(line)
        state = next(x.removeprefix('state_') for x in reversed(lines) if x.startswith('state_'))
        return state, [x for x in lines if not x.startswith('state_')]

    def ok(self, sql):
        state, lines = self.execute(sql)
        assert state == '00000', (state, lines)
        return lines

    def close(self):
        if self.process.poll() is None:
            self.execute('rollback')
            self.process.stdin.write('\\q\n')
            self.process.stdin.flush()
            self.process.wait(timeout=5)


def fixtures(db):
    a, b = str(uuid4()), str(uuid4())
    db.ok(f"insert into auth.users(id,email,raw_user_meta_data) values "
          f"('{a}','{a}@test.local','{{}}'),('{b}','{b}@test.local','{{}}')")
    db.ok(f"update public.profiles set nickname='테스트' where user_id in ('{a}','{b}')")
    post = json.loads(db.ok(f"select public.community_create_post('{a}','synthetic','{{}}')")[0])
    return a, b, post['post_id']


def wait_for_lock(observer, blocked_pid, blocker_pid):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if observer.ok(f'select {blocker_pid} = any(pg_blocking_pids({blocked_pid}))')[0] == 't':
            return
        time.sleep(.025)
    raise AssertionError('Expected transaction overlap was not observed')


def empty(db, a, post):
    n = db.ok(f"select (select count(*) from auth.users where id='{a}') + "
              f"(select count(*) from public.community_posts where post_id='{post}') + "
              f"(select count(*) from public.community_post_likes where post_id='{post}') + "
              f"(select count(*) from public.community_comments where post_id='{post}')")[0]
    assert n == '0', n


def main():
    observer, writer, deleting = Session(), Session(), Session()
    results = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            a, b, post = fixtures(observer)
            writer.ok('begin; set local role service_role')
            writer.ok(f"select public.community_set_like('{b}','{post}',true)")
            deleting.ok('begin')
            deletion = pool.submit(deleting.execute, f"delete from auth.users where id='{a}'")
            wait_for_lock(observer, deleting.pid, writer.pid)
            writer.ok('commit')
            assert deletion.result()[0] == '00000'
            deleting.ok('commit')
            empty(observer, a, post)
            observer.ok(f"delete from auth.users where id='{b}'")
            results.append({'scenario': 'like before account deletion', 'passed': True})

            a, b, post = fixtures(observer)
            deleting.ok('begin')
            deleting.ok(f"delete from auth.users where id='{a}'")
            writer.ok('begin; set local role service_role')
            like = pool.submit(writer.execute, f"select public.community_set_like('{b}','{post}',true)")
            wait_for_lock(observer, writer.pid, deleting.pid)
            deleting.ok('commit')
            state, lines = like.result()
            assert state == 'P0001', (state, lines)
            writer.ok('rollback')
            empty(observer, a, post)
            observer.ok(f"delete from auth.users where id='{b}'")
            results.append({'scenario': 'account deletion before like', 'passed': True})

            # Hold the Auth row lock that DELETE takes before its BEFORE trigger.
            # The RPC locks/deletes the comment before requesting the post owner's
            # Auth lock, while the cascade holds Auth and needs the comment.
            a, b, post = fixtures(observer)
            comment = json.loads(observer.ok(
                f"select public.community_add_comment('{b}','{post}','synthetic')")[0])['comment_id']
            deleting.ok('begin')
            deleting.ok(f"select id from auth.users where id='{a}' for update")
            writer.ok('begin; set local role service_role')
            removal = pool.submit(writer.execute, f"select public.community_delete_comment('{b}','{comment}')")
            wait_for_lock(observer, writer.pid, deleting.pid)
            deletion = pool.submit(deleting.execute, f"delete from auth.users where id='{a}'")
            first, _ = concurrent.futures.wait([removal, deletion],
                return_when=concurrent.futures.FIRST_COMPLETED)
            for future in first:
                session = writer if future is removal else deleting
                session.ok('commit' if future.result()[0] == '00000' else 'rollback')
            outcomes = [removal.result(), deletion.result()]
            writer.ok('rollback')
            deleting.ok('rollback')
            states = [r[0] for r in outcomes]
            results.append({'scenario': 'comment deletion overlaps author account deletion',
                            'passed': states == ['P0001', '00000'],
                            'sqlstates': states,
                            'diagnostics': [line for _, lines in outcomes for line in lines
                                            if line.startswith(('ERROR:', 'DETAIL:', 'CONTEXT:', 'Process '))]})
            observer.ok(f"delete from auth.users where id in ('{a}','{b}')")

            # Two attempts to delete one comment serialize on its parent post.
            a, b, post = fixtures(observer)
            comment = json.loads(observer.ok(
                f"select public.community_add_comment('{b}','{post}','synthetic')")[0])['comment_id']
            writer.ok('begin; set local role service_role')
            writer.ok(f"select public.community_delete_comment('{b}','{comment}')")
            deleting.ok('begin; set local role service_role')
            duplicate = pool.submit(deleting.execute,
                f"select public.community_delete_comment('{a}','{comment}')")
            wait_for_lock(observer, deleting.pid, writer.pid)
            writer.ok('commit')
            assert duplicate.result()[0] == 'P0001'
            deleting.ok('rollback')
            assert observer.ok(f"select comment_count from public.community_posts where post_id='{post}'")[0] == '0'
            observer.ok(f"delete from auth.users where id in ('{a}','{b}')")
            results.append({'scenario': 'duplicate comment deletion decrements once', 'passed': True})

            # A successful comment delete must release before Auth can disappear.
            a, b, post = fixtures(observer)
            comment = json.loads(observer.ok(
                f"select public.community_add_comment('{b}','{post}','synthetic')")[0])['comment_id']
            writer.ok('begin; set local role service_role')
            writer.ok(f"select public.community_delete_comment('{b}','{comment}')")
            deleting.ok('begin')
            deletion = pool.submit(deleting.execute, f"delete from auth.users where id='{a}'")
            wait_for_lock(observer, deleting.pid, writer.pid)
            writer.ok('commit')
            assert deletion.result()[0] == '00000'
            deleting.ok('commit')
            empty(observer, a, post)
            observer.ok(f"delete from auth.users where id='{b}'")
            results.append({'scenario': 'comment deletion before author account deletion', 'passed': True})

            # Two users with reciprocal content both finish their deletion markers
            # before the Auth stage, as the real delete-account service does.
            a, b, post = fixtures(observer)
            other = json.loads(observer.ok(f"select public.community_create_post('{b}','other','{{}}')")[0])['post_id']
            for user, target in ((a, other), (b, post)):
                observer.ok(f"select public.community_set_like('{user}','{target}',true)")
                observer.ok(f"select public.community_add_comment('{user}','{target}','cross')")
                observer.ok(f"select public.community_set_repost('{user}','{target}',true)")
            for user in (a, b):
                observer.ok(f"select public.begin_account_deletion('{user}')")
            writer.ok('begin')
            deleting.ok('begin')
            writer.ok(f"select id from auth.users where id='{a}' for update")
            deleting.ok(f"select id from auth.users where id='{b}' for update")
            first_delete = pool.submit(writer.execute, f"delete from auth.users where id='{a}'")
            second_delete = pool.submit(deleting.execute, f"delete from auth.users where id='{b}'")
            first, _ = concurrent.futures.wait([first_delete, second_delete],
                return_when=concurrent.futures.FIRST_COMPLETED)
            for future in first:
                session = writer if future is first_delete else deleting
                session.ok('commit' if future.result()[0] == '00000' else 'rollback')
            states = [first_delete.result()[0], second_delete.result()[0]]
            writer.ok('commit' if states[0] == '00000' else 'rollback')
            deleting.ok('commit' if states[1] == '00000' else 'rollback')
            results.append({'scenario': 'two accounts delete reciprocal content',
                            'passed': states == ['00000', '00000'], 'sqlstates': states})
            if states == ['00000', '00000']:
                empty(observer, a, post)
                empty(observer, b, other)
            else:
                observer.ok(f"delete from auth.users where id in ('{a}','{b}')")
    finally:
        for session in (writer, deleting, observer):
            session.close()
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0 if all(r['passed'] for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
