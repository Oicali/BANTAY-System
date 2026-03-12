const jwt = require("jsonwebtoken");
require("dotenv").config();

function jwtGenerator(user) {
  const payload = {
    user_id: user.user_id,  
    username: user.username,
    email: user.email,
    role: user.role,
  }; 
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1hr" });
}

// 🎫 Create JWT token containing user information
// 📝 What it does:
//    - Creates payload with user_id, username, email, role
//    - Signs payload with JWT_SECRET (from .env file)
//    - Sets expiration time to 1 hour
//    - Returns signed JWT token string
//
// 📦 Token Structure:
//    - Header: Algorithm and token type
//    - Payload: { user_id, username, email, role, exp, iat }
//    - Signature: Encrypted hash using JWT_SECRET
//
// 🔐 Security: JWT_SECRET must be kept secure in .env file
// ⏱️ Expiration: Token expires in 1 hour (user must re-login)
//
// 📊 Example Token:
//    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6ImFkbWluIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJBZG1pbmlzdHJhdG9yIiwiZXhwIjoxNzA2NjMwNDAwLCJpYXQiOjE3MDY2MjY4MDB9.signature_here"
//
// 🔗 Token is returned to: routes/jwtAuth.js → STEP 13
// 🔗 Next Step: Token sent to frontend → Go to STEP 15

module.exports = jwtGenerator;