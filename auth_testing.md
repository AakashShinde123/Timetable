# Auth-Gated App Testing Playbook

## Step 1: Create Test User & Session via mongosh
```
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  role: 'Super Admin',
  school_ids: [],
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
```

## Step 2: Test backend with curl
```
curl -X GET "$REACT_APP_BACKEND_URL/api/auth/me" -H "Authorization: Bearer $SESSION_TOKEN"
curl -X GET "$REACT_APP_BACKEND_URL/api/schools" -H "Authorization: Bearer $SESSION_TOKEN"
curl -X POST "$REACT_APP_BACKEND_URL/api/schools" -H "Authorization: Bearer $SESSION_TOKEN" -H "Content-Type: application/json" -d '{"name":"Test School","location":"X","board":"CBSE"}'
```

## Step 3: Browser testing with Playwright
```
await page.context.add_cookies([{
  "name": "session_token", "value": "<TOKEN>",
  "domain": "<host>", "path": "/", "httpOnly": True, "secure": True, "sameSite": "None"
}])
```
