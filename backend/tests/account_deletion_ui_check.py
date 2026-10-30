"""Opt-in browser check with mocked accounts; never deletes a real account."""
import json

from playwright.sync_api import expect, sync_playwright


SDK = """window.supabase={createClient:()=>{let cb;let session={access_token:'mock-token',
user:{id:'00000000-0000-4000-8000-000000000001',email:'mock@example.com',
app_metadata:{provider:'test'},user_metadata:{}}};return {auth:{
getSession:async()=>({data:{session},error:null}),
onAuthStateChange:f=>{cb=f;return {data:{subscription:{unsubscribe(){}}}}},
signOut:async()=>{session=null;cb?.('SIGNED_OUT',null);return {error:null}},
setSession:async()=>({data:{session},error:null})}}}};"""


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for filename in ['diet-ui-test.html', 'g.html']:
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            pending = []

            def route(request):
                url = request.request.url
                if '/api/account' in url:
                    assert request.request.method == 'DELETE'
                    assert request.request.headers['authorization'] == 'Bearer mock-token'
                    pending.append(request)
                    return
                if 'cdn.jsdelivr.net' in url:
                    request.fulfill(content_type='application/javascript', body=SDK)
                    return
                if '/auth/v1/token' in url:
                    data = {'access_token': 'mock-token'}
                elif '/api/diet/inventory' in url:
                    data = {'inventory': []}
                elif '/api/diet/recommendations' in url:
                    data = {'result': None}
                elif '/api/diet/nutrition-summary' in url:
                    data = {'summary': {'has_recommendation': False, **{
                        key: {'consumed': 0, 'target': None, 'unit': 'g'}
                        for key in ['calories', 'carbohydrates', 'protein', 'fat']}}}
                else:
                    raise AssertionError(f'Unexpected external request: {url}')
                request.fulfill(content_type='application/json', body=json.dumps(data))

            page.route('https://**/*', route)
            page.goto(f'http://127.0.0.1:3000/{filename}')
            page.wait_for_load_state('networkidle')
            if filename.startswith('diet'):
                page.locator('#email').fill('mock@example.com')
                page.locator('#password').fill('mock-password')
                page.locator('#login-form button[type=submit]').click()
            opener = page.locator('#delete-account')
            expect(opener).to_be_visible()
            opener.focus()
            page.keyboard.press('Enter')
            dialog = page.locator('.account-deletion-dialog')
            cancel = page.locator('.account-deletion-cancel')
            confirm = page.locator('.account-deletion-confirm')
            expect(cancel).to_be_focused()
            page.keyboard.press('Escape')
            expect(dialog).not_to_be_visible()
            expect(opener).to_be_focused()
            assert not pending
            opener.click()
            for width in [320, 768, 1024, 1440]:
                page.set_viewport_size({'width': width, 'height': 800})
                assert dialog.evaluate('(el)=>el.getBoundingClientRect().width <= innerWidth')
                assert dialog.evaluate('(el)=>el.scrollWidth <= el.clientWidth')
            page.evaluate("document.querySelector('.account-deletion-confirm').click(); document.querySelector('.account-deletion-confirm').click()")
            expect(confirm).to_be_disabled()
            expect(page.locator('#logout')).to_be_disabled()
            page.keyboard.press('Escape')
            expect(dialog).to_be_visible()
            page.wait_for_function("document.querySelector('.account-deletion-dialog').getAttribute('aria-busy') === 'true'")
            # Let Playwright dispatch the intercepted request before responding.
            page.wait_for_timeout(100)
            assert len(pending) == 1
            pending.pop().fulfill(status=502, body='{}')
            expect(confirm).to_have_text('탈퇴 다시 시도')
            expect(page.locator('#app' if filename.startswith('diet') else '#api-test')).to_have_attribute('inert', '')
            confirm.click()
            page.wait_for_timeout(100)
            assert len(pending) == 1
            pending.pop().fulfill(status=204)
            expect(opener).not_to_be_visible()
            expect(dialog).not_to_be_visible()
            expect(page.locator('#logout')).not_to_be_visible()
            expect(page.locator('#notice' if filename.startswith('diet') else '#status')).to_contain_text('회원탈퇴가 완료')
            assert not errors, errors
            page.close()
            print(f'PASS {filename}: cancel, focus, responsive dialog, duplicate guard, failure/retry, logout')
        for scenario in ['expired', 'network', 'missing-token', 'cleanup-error']:
            page = browser.new_page()
            page.goto('http://127.0.0.1:3000/diet-ui-test.html')
            page.set_content('<meta charset="utf-8"><button id="delete-account">회원탈퇴</button>')
            page.add_script_tag(url='http://127.0.0.1:3000/account-deletion-ui.js')
            calls = []

            def respond(request):
                calls.append(request.request.method)
                if scenario == 'network':
                    request.abort()
                else:
                    request.fulfill(status=401 if scenario == 'expired' else 204)

            page.route('https://auto-fit-api-dev.onrender.com/api/account', respond)
            page.evaluate('''scenario => window.AutoFitAccountDeletion(document.querySelector('button'), {
              apiBase: 'https://auto-fit-api-dev.onrender.com',
              getAccessToken: async()=>scenario==='missing-token'?null:'mock-token',
              onDeleted: async()=>{if(scenario==='cleanup-error')throw Error('local cleanup')}
            })''', scenario)
            page.locator('#delete-account').click()
            page.locator('.account-deletion-confirm').click()
            expected = {'expired': '로그인 세션이 만료', 'network': '처리 결과를 확인하지',
                        'missing-token': '로그인이 필요', 'cleanup-error': '계정 삭제가 완료'}[scenario]
            expect(page.locator('.account-deletion-message')).to_contain_text(expected)
            expect(page.locator('.account-deletion-dialog')).to_be_visible()
            assert calls == ([] if scenario == 'missing-token' else ['DELETE'])
            if scenario == 'cleanup-error':
                expect(page.locator('.account-deletion-confirm')).not_to_be_visible()
                expect(page.locator('.account-deletion-cancel')).to_have_text('닫기')
            page.close()
            print(f'PASS {scenario}')
        browser.close()


if __name__ == '__main__':
    run()
