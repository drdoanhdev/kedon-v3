# Login Access Check Test Checklist

## Scope
Validate post-login access check behavior in `AuthContext` after retry and hard-deny changes.

## Preconditions
- Test account is member of one tenant.
- Browser has devtools open (Network tab).
- App is using latest code with updated login-access-check flow.

## Case 1: Success Path
1. Login with normal network.
2. Wait for tenant context to load.
Expected:
- No retry toast.
- User remains logged in.
- No forced redirect to login.

## Case 2: Transient 500 Then Recover
1. Simulate first request to `/api/auth/login-access-check` returning 500.
2. Allow next request to return 200.
Expected:
- One loading toast appears: retrying access check.
- Toast is dismissed after success.
- User remains logged in.
- No forced signout.

## Case 3: Timeout/Network Error
1. Block or drop network during access-check call.
2. Restore network.
Expected:
- App does not force signout on transient failure.
- User session remains active.
- API guards still enforce permissions on protected API calls.

## Case 4: Hard Deny - Device Locked
1. Configure member policy with `single_device_only=true` and lock another device id.
2. Login from current device.
Expected:
- Error toast from backend message.
- Forced signout occurs.
- Redirect to login page.

## Case 5: Hard Deny - IP Not Allowed
1. Configure policy with `enforce_store_network=true` and allow-list that excludes current IP.
2. Login.
Expected:
- Error toast from backend message.
- Forced signout occurs.
- Redirect to login page.

## Case 6: Hard Deny - Out Of Working Hours
1. Configure `enforce_working_hours=true` with a window that excludes current time.
2. Login.
Expected:
- Error toast from backend message.
- Forced signout occurs.
- Redirect to login page.

## Case 7: Unauthorized Token (401)
1. Use invalid/expired token scenario for access-check request.
Expected:
- Forced signout occurs.
- Redirect to login page.

## Regression Checks
1. Retry toast should not stack multiple times.
2. Retry toast must always dismiss after success, hard-deny, cancellation, or catch path.
3. No infinite request loop.
