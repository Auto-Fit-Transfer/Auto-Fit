"""Deterministic club, message and challenge races in the isolated PostgreSQL container.

Load support/load_docker_schema.mjs first. This imports Session's fixed container target;
there is no remote connection string or production account input.
"""
import concurrent.futures
import json
from uuid import uuid4

from community_concurrency import Session, wait_for_lock

CREATED_USERS = []
CREATED_CHALLENGES = []


def user(db):
    value = str(uuid4())
    db.ok(f"insert into auth.users(id,email,raw_user_meta_data) values "
          f"('{value}','{value}@test.local','{{}}')")
    CREATED_USERS.append(value)
    db.ok(f"update public.profiles set nickname='시험{value[:6]}' where user_id='{value}'")
    return value


def club_fixture(db):
    owner, member = user(db), user(db)
    db.ok(f"select public.community_start_demo_membership('{owner}')")
    club = json.loads(db.ok(
        f"select public.community_create_club('{owner}','시험 {owner[:8]}',null,'running')")[0]
    )['club_id']
    db.ok(f"select public.community_set_club_membership('{member}','{club}',true)")
    post = json.loads(db.ok(
        f"select public.community_create_club_post('{member}','{club}','synthetic','{{}}')")[0]
    )['post_id']
    return owner, member, club, post


def assert_club_gone(db, owner, member, club, post):
    total = db.ok(f"select (select count(*) from auth.users where id='{member}') + "
                  f"(select count(*) from public.community_clubs where club_id='{club}') + "
                  f"(select count(*) from public.community_club_members where club_id='{club}') + "
                  f"(select count(*) from public.community_posts where post_id='{post}')")[0]
    assert total == '0', total
    assert db.ok(f"select count(*) from auth.users where id='{owner}'")[0] == '1'


def club_delete_before_member_leave(db, owner_session, leaving_session, pool):
    owner, member, club, post = club_fixture(db)
    owner_session.ok('begin; set local role service_role')
    owner_session.ok(f"select public.community_delete_club('{owner}','{club}')")
    leaving_session.ok('begin')
    leaving_session.ok(f"select public.begin_account_deletion('{member}')")
    departure = pool.submit(leaving_session.execute, f"delete from auth.users where id='{member}'")
    wait_for_lock(db, leaving_session.pid, owner_session.pid)
    owner_session.ok('commit')
    assert departure.result()[0] == '00000', departure.result()
    leaving_session.ok('commit')
    assert_club_gone(db, owner, member, club, post)
    db.ok(f"delete from auth.users where id='{owner}'")


def member_leave_before_club_delete(db, owner_session, leaving_session, pool):
    owner, member, club, post = club_fixture(db)
    leaving_session.ok('begin')
    leaving_session.ok(f"select public.begin_account_deletion('{member}')")
    leaving_session.ok(f"delete from auth.users where id='{member}'")
    owner_session.ok('begin; set local role service_role')
    deletion = pool.submit(owner_session.execute,
                           f"select public.community_delete_club('{owner}','{club}')")
    wait_for_lock(db, owner_session.pid, leaving_session.pid)
    leaving_session.ok('commit')
    assert deletion.result()[0] == '00000', deletion.result()
    owner_session.ok('commit')
    assert_club_gone(db, owner, member, club, post)
    db.ok(f"delete from auth.users where id='{owner}'")


def message_fixture(db):
    sender, recipient = user(db), user(db)
    db.ok(f"select public.community_set_follow('{sender}','{recipient}',true)")
    db.ok(f"select public.community_set_follow('{recipient}','{sender}',true)")
    conversation = json.loads(db.ok(
        f"select public.community_open_conversation('{sender}','{recipient}')")[0]
    )['conversation_id']
    return sender, recipient, conversation


def assert_conversation_gone(db, sender, recipient, conversation):
    total = db.ok(f"select (select count(*) from auth.users where id='{recipient}') + "
                  f"(select count(*) from public.community_conversations "
                  f"where conversation_id='{conversation}') + "
                  f"(select count(*) from public.community_messages "
                  f"where conversation_id='{conversation}') + "
                  f"(select count(*) from public.community_conversation_reads "
                  f"where conversation_id='{conversation}')")[0]
    assert total == '0', total
    assert db.ok(f"select count(*) from auth.users where id='{sender}'")[0] == '1'


def message_before_recipient_leave(db, sending, leaving, pool):
    sender, recipient, conversation = message_fixture(db)
    sending.ok('begin; set local role service_role')
    sending.ok(f"select public.community_send_message('{sender}','{conversation}','in flight')")
    leaving.ok('begin')
    marker = pool.submit(leaving.execute, f"select public.begin_account_deletion('{recipient}')")
    wait_for_lock(db, leaving.pid, sending.pid)
    sending.ok('commit')
    assert marker.result()[0] == '00000', marker.result()
    leaving.ok(f"delete from auth.users where id='{recipient}'")
    leaving.ok('commit')
    assert_conversation_gone(db, sender, recipient, conversation)
    db.ok(f"delete from auth.users where id='{sender}'")


def recipient_leave_before_message(db, sending, leaving, pool):
    sender, recipient, conversation = message_fixture(db)
    leaving.ok('begin')
    leaving.ok(f"select public.begin_account_deletion('{recipient}')")
    leaving.ok(f"delete from auth.users where id='{recipient}'")
    sending.ok('begin; set local role service_role')
    message = pool.submit(sending.execute,
                          f"select public.community_send_message('{sender}','{conversation}','late')")
    wait_for_lock(db, sending.pid, leaving.pid)
    leaving.ok('commit')
    state, lines = message.result()
    assert state == 'P0001', (state, lines)
    sending.ok('rollback')
    assert_conversation_gone(db, sender, recipient, conversation)
    db.ok(f"delete from auth.users where id='{sender}'")


def challenge_fixture(db):
    moderator, participant = user(db), user(db)
    db.ok(f"insert into public.community_moderators(user_id) values ('{moderator}')")
    title = f"시험 {moderator[:8]}"
    challenge = json.loads(db.ok(
        f"select public.community_admin_save_challenge('{moderator}',null,'{title}',null,"
        "'workout_days',2,public.community_today(),public.community_today()+6,0,true)")[0]
    )['challenge_id']
    CREATED_CHALLENGES.append(challenge)
    return moderator, participant, challenge, title


def save_challenge(moderator, challenge, title, goal):
    return (f"select public.community_admin_save_challenge('{moderator}','{challenge}',"
            f"'{title}',null,'workout_days',{goal},public.community_today(),"
            "public.community_today()+6,0,true)")


def finish_challenge(db, moderator, participant, challenge, expected_goal):
    values = db.ok(f"select goal || ':' || "
                   f"(select count(*) from public.community_challenge_participants "
                   f"where challenge_id='{challenge}') from public.community_challenges "
                   f"where challenge_id='{challenge}'")[0]
    assert values == f'{expected_goal}:1', values
    db.ok(f"delete from public.community_challenge_participants where challenge_id='{challenge}'")
    db.ok(f"delete from public.community_challenges where challenge_id='{challenge}'")
    db.ok(f"delete from public.community_moderators where user_id='{moderator}'")
    db.ok(f"delete from auth.users where id in ('{moderator}','{participant}')")


def admin_edit_before_join(db, admin, joining, pool):
    moderator, participant, challenge, title = challenge_fixture(db)
    admin.ok('begin; set local role service_role')
    admin.ok(save_challenge(moderator, challenge, title, 3))
    joining.ok('begin; set local role service_role')
    join = pool.submit(joining.execute,
                       f"select public.community_set_challenge_participation('{participant}','{challenge}',true)")
    wait_for_lock(db, joining.pid, admin.pid)
    admin.ok('commit')
    assert join.result()[0] == '00000', join.result()
    joining.ok('commit')
    finish_challenge(db, moderator, participant, challenge, 3)


def join_before_admin_edit(db, admin, joining, pool):
    moderator, participant, challenge, title = challenge_fixture(db)
    joining.ok('begin; set local role service_role')
    joining.ok(f"select public.community_set_challenge_participation('{participant}','{challenge}',true)")
    admin.ok('begin; set local role service_role')
    edit = pool.submit(admin.execute, save_challenge(moderator, challenge, title, 3))
    wait_for_lock(db, admin.pid, joining.pid)
    joining.ok('commit')
    state, lines = edit.result()
    assert state == 'P0001', (state, lines)
    admin.ok('rollback')
    finish_challenge(db, moderator, participant, challenge, 2)


def main():
    observer, writer, deleting = Session(), Session(), Session()
    results = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            club_delete_before_member_leave(observer, writer, deleting, pool)
            results.append({'scenario': 'club deletion before member account deletion', 'passed': True})
            member_leave_before_club_delete(observer, writer, deleting, pool)
            results.append({'scenario': 'member account deletion before club deletion', 'passed': True})
            message_before_recipient_leave(observer, writer, deleting, pool)
            results.append({'scenario': 'message before recipient account deletion', 'passed': True})
            recipient_leave_before_message(observer, writer, deleting, pool)
            results.append({'scenario': 'recipient account deletion before message', 'passed': True})
            admin_edit_before_join(observer, writer, deleting, pool)
            results.append({'scenario': 'admin challenge edit before join', 'passed': True})
            join_before_admin_edit(observer, writer, deleting, pool)
            results.append({'scenario': 'join before admin challenge edit', 'passed': True})
    finally:
        for session in (writer, deleting):
            session.close()
        try:
            for challenge in CREATED_CHALLENGES:
                observer.ok(f"delete from public.community_challenge_participants where challenge_id='{challenge}'")
                observer.ok(f"delete from public.community_challenges where challenge_id='{challenge}'")
            for value in CREATED_USERS:
                observer.ok(f"delete from public.community_moderators where user_id='{value}'")
                observer.ok(f"delete from auth.users where id='{value}'")
        finally:
            observer.close()
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0 if all(item['passed'] for item in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
