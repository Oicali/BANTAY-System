export const logout = async () => {
  try {
    const token = localStorage.getItem('token');
    
    if (token) {
      // Call backend logout to revoke token
      await fetch('http://localhost:5000/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Always clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('profilePicture');
    
    window.location.href = '/login';
  }
};

// 🚪 Log out the user
// 📝 What it does:
//    - Removes JWT token from localStorage
//    - Redirects user to login page
//
// 🔗 Triggered by: User clicking "Logout" button
// ⚠️ WEAK SECURITY PRACTICE: Using window.location instead of React Router

export const isAuthenticated = () => {
  return !!localStorage.getItem('token');
};

// ✅ Check if user is logged in
// 📝 What it does:
//    - Checks if JWT token exists in localStorage
//    - Returns true if token exists, false otherwise
//
// 🔗 Used by: ProtectedRoute component (guards protected pages)
// ⚠️ WEAK SECURITY PRACTICE: Only checks existence, not validity
//    Token could be expired or invalid
//    Better: Verify token with backend or check expiration

export const getToken = () => {
  return localStorage.getItem('token');
};

// 🎫 Retrieve the JWT token
// 📝 Returns JWT token from localStorage
// 🔗 Used by: API calls that require authentication
//
// 📊 Usage Example:
//    fetch('/api/blotters', {
//      headers: { 'Authorization': `Bearer ${getToken()}` }
//    })

export const getUserFromToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  // 🎫 Extract user information from JWT token
  // 📝 Retrieves token from localStorage
  // 🔗 If no token: Returns null
  // 🔗 If token exists: Decodes below
  
  try {
    const base64Url = token.split('.')[1];

    // 🔍 Extract payload from JWT token
    // 📝 JWT Structure: header.payload.signature
    //    - header: Token metadata
    //    - payload: User data (what we want)
    //    - signature: Security verification
    //
    // 📊 Example: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.signature"
    //              ↑ header          ↑ payload       ↑ signature
    //
    // 🔗 Next Step: Decode base64 → Continue below

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    // 🔄 Convert URL-safe base64 to standard base64
    // 📝 JWT uses URL-safe base64 (- instead of +, _ instead of /)
    // 🔗 Next Step: Decode to JSON → Continue below

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    // 🔓 Decode base64 to JSON string
    // 📝 What it does:
    //    - atob() decodes base64 to binary string
    //    - Maps each character to URL-encoded format
    //    - decodeURIComponent() converts to readable string
    //
    // 📦 Result: JSON string like
    //    '{"user_id":1,"username":"admin","role":"Administrator",...}'
    //
    // 🔗 Next Step: Parse JSON → Continue below

    const decoded = JSON.parse(jsonPayload);

    // 📦 Parse JSON string to JavaScript object
    // 📊 Decoded object:
    //    { user_id: 1, username: "admin", email: "admin@example.com",
    //      role: "Administrator", exp: 1706630400, iat: 1706626800 }
    //
    // 🔗 Next Step: Return user data → Continue below

    return decoded.user || decoded;  

    // 👤 Return the user object
    // 📝 Returns decoded.user if exists (old format) or decoded (current format)
    //
    // 📊 Returned data: { user_id, username, email, role }
    // 🔗 Used by: Dashboard, Profile page, Navigation
    // 🔗 Also used by: roleAccess checks → STEP 30
    
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;

    // ❌ Handle token decoding errors
    // 📝 Catches errors if token is malformed or corrupted
    // 🔒 Security: If token tampered with, user logged out
  }
};

// ⚠️ WEAK SECURITY PRACTICE: Client-side JWT decoding
//    - Frontend can decode token but CANNOT verify signature
//    - Malicious user could modify token payload in browser
//    - Backend MUST verify token signature on all protected endpoints
//    - Frontend decoding is ONLY for UI display, NOT for authorization