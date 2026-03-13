# BANTAY System — API Reference

**Base URL:** `http://localhost:<PORT>`  
**Auth:** Bearer token (JWT) required on all 🔒 endpoints.  
Send token in the `Authorization` header: `Authorization: Bearer <token>`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User Management](#2-user-management)
3. [User Profile](#3-user-profile)
4. [Email Verification](#4-email-verification)
5. [Password Management](#5-password-management)
6. [Roles](#6-roles)
7. [Health Check](#7-health-check)
8. [Error Responses](#8-error-responses)
9. [PSGC Hook (Frontend)](#9-psgc-hook-frontend)

---

## 1. Authentication

Base path: `/auth`

### POST `/auth/login`

Authenticate a user and receive a JWT token.

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response `200`**
```json
{
  "token": "<jwt_token>",
  "user": {
    "user_id": 1,
    "username": "jdoe",
    "email": "user@example.com",
    "role": "Administrator"
  }
}
```

---

### POST `/auth/logout` 🔒

Revoke the current session token.

**Headers:** `Authorization: Bearer <token>`  
**Response `200`:** `{ "message": "Logged out successfully" }`

---

### POST `/auth/logout-all` 🔒

Revoke all active sessions for the authenticated user.

**Headers:** `Authorization: Bearer <token>`  
**Response `200`:** `{ "message": "All sessions logged out" }`

---

### POST `/auth/otp/send`

Send a one-time password to an email address.

**Request Body**
```json
{ "email": "user@example.com" }
```

**Response `200`:** `{ "message": "OTP sent successfully" }`

---

### POST `/auth/otp/verify`

Verify a one-time password.

**Request Body**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response `200`:** `{ "message": "OTP verified" }`

---

### POST `/auth/otp/resend`

Resend a one-time password.

**Request Body**
```json
{ "email": "user@example.com" }
```

**Response `200`:** `{ "message": "OTP resent" }`

---

### POST `/auth/password/reset`

Reset a user's password using a verified OTP.

**Request Body**
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "NewSecurePass123!"
}
```

**Response `200`:** `{ "message": "Password reset successfully" }`

---

### POST `/auth/password/change` 🔒

Change the authenticated user's password directly.

**Request Body**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

**Response `200`:** `{ "message": "Password changed successfully" }`

---

## 2. User Management

Base path: `/user-management`  
All endpoints require 🔒 authentication unless noted.

---

### GET `/user-management/verify-account`

Verify a user account via emailed token link.

**Query Params**

| Param   | Type   | Required | Description          |
|---------|--------|----------|----------------------|
| `token` | string | Yes      | Raw verification token |

**Response `200`:** `{ "message": "Account verified successfully" }`

---

### GET `/user-management/users` 🔒

Retrieve a paginated, filterable list of users.

**Query Params**

| Param      | Type   | Required | Description                            |
|------------|--------|----------|----------------------------------------|
| `userType` | string | No       | e.g. `police`, `civilian`              |
| `status`   | string | No       | `active`, `locked`, `deactivated`      |
| `search`   | string | No       | Search by name, username, or email     |
| `role`     | string | No       | Filter by role name                    |
| `page`     | number | No       | Page number (default: `1`)             |
| `limit`    | number | No       | Items per page (default: `20`)         |

**Response `200`**
```json
{
  "users": [ { "user_id": 1, "username": "jdoe", "..." : "..." } ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

### GET `/user-management/filter-options` 🔒

Retrieve available filter options (roles list for police-type users).

**Response `200`**
```json
{
  "roles": [ { "role_id": 1, "role_name": "Administrator" } ]
}
```

---

### GET `/user-management/users/:id` 🔒

Retrieve a specific user by ID.

**Path Params**

| Param | Type    | Description |
|-------|---------|-------------|
| `id`  | integer | User ID     |

**Response `200`:** User object.

---

### POST `/user-management/register` 🔒

Register a new user. Accepts `multipart/form-data` for profile picture upload.

**Form Fields**

| Field            | Type   | Required | Description               |
|------------------|--------|----------|---------------------------|
| `username`       | string | Yes      |                           |
| `email`          | string | Yes      |                           |
| `password`       | string | Yes      |                           |
| `role`           | string | Yes      |                           |
| `profilePicture` | file   | No       | Image file (multipart)    |

**Response `201`:** `{ "message": "User registered", "user_id": 5 }`

---

### PUT `/user-management/users/:id` 🔒

Update a user's information. Accepts `multipart/form-data`.

**Path Params:** `id` — User ID  
**Form Fields:** Same as register (all optional).  
**Response `200`:** Updated user object.

---

### PUT `/user-management/users/:id/lock` 🔒

Lock a user account.

**Response `200`:** `{ "message": "User locked" }`

---

### PUT `/user-management/users/:id/unlock` 🔒

Unlock a locked user account.

**Response `200`:** `{ "message": "User unlocked" }`

---

### DELETE `/user-management/users/:id` 🔒

Deactivate (soft-delete) a user account.

**Response `200`:** `{ "message": "User deactivated" }`

---

### PUT `/user-management/users/:id/restore` 🔒

Restore a deactivated user account.

**Response `200`:** `{ "message": "User restored" }`

---

### POST `/user-management/users/:id/resend-verification` 🔒

Resend the account verification email to a user.

**Response `200`:** `{ "message": "Verification email resent" }`

---

## 3. User Profile

Base path: `/users`  
All endpoints require 🔒 authentication.

---

### GET `/users/profile` 🔒

Get the current authenticated user's profile.

**Response `200`:** Full user profile object.

---

### PUT `/users/profile/:id` 🔒

Update a user's profile. Accepts `multipart/form-data`.

**Path Params:** `id` — User ID  
**Form Fields:** Any profile fields + optional `profilePicture` file.  
**Response `200`:** Updated profile object.

---

### POST `/users/check-phone` 🔒

Check if a phone number is already in use.

**Request Body**
```json
{ "phone": "09171234567" }
```

**Response `200`:** `{ "available": true }`

---

### POST `/users/profile/picture` 🔒

Upload a profile picture for the authenticated user.

**Form Fields:** `profilePicture` (file, multipart)  
**Response `200`:** `{ "url": "https://..." }`

---

### POST `/users/profile/picture/:userId` 🔒

Upload a profile picture for a specific user (admin use).

**Path Params:** `userId` — Target user ID  
**Form Fields:** `profilePicture` (file, multipart)  
**Response `200`:** `{ "url": "https://..." }`

---

## 4. Email Verification

Base path: `/users/email`  
All endpoints require 🔒 authentication.

This section covers the multi-step flow for changing a user's email address.

| Step | Endpoint | Description |
|------|----------|-------------|
| 0 | `GET /email/status` | Check current email verification status |
| 1 | `POST /email/verify-password` | Verify current password before making changes |
| 2 | `POST /email/request-old-otp` | Send OTP to current email |
| 3 | `POST /email/verify-old-otp` | Verify OTP sent to old email |
| 4 | `POST /email/request-new-otp` | Send OTP to new email address |
| 5 | `POST /email/verify-new-otp` | Verify OTP sent to new email, completing the change |
| — | `POST /email/force-lock` | Force-lock the OTP flow (called by frontend timer on expiry) |

---

### GET `/users/email/status` 🔒

Returns the current state of the email verification flow.

**Response `200`**
```json
{
  "email": "current@example.com",
  "status": "verified"
}
```

---

### POST `/users/email/verify-password` 🔒

**Request Body:** `{ "password": "yourpassword" }`  
**Response `200`:** `{ "message": "Password verified" }`

---

### POST `/users/email/request-old-otp` 🔒

Sends OTP to the user's **current** email.  
**Response `200`:** `{ "message": "OTP sent to current email" }`

---

### POST `/users/email/verify-old-otp` 🔒

**Request Body:** `{ "otp": "123456" }`  
**Response `200`:** `{ "message": "Old email verified" }`

---

### POST `/users/email/request-new-otp` 🔒

**Request Body:** `{ "newEmail": "new@example.com" }`  
**Response `200`:** `{ "message": "OTP sent to new email" }`

---

### POST `/users/email/verify-new-otp` 🔒

**Request Body:** `{ "otp": "654321" }`  
**Response `200`:** `{ "message": "Email changed successfully" }`

---

### POST `/users/email/force-lock` 🔒

Called by the frontend when an OTP timer expires to lock the flow.  
**Response `200`:** `{ "message": "Email verification locked" }`

---

## 5. Password Management

Base path: `/users/password`  
All endpoints require 🔒 authentication.

| Step | Endpoint | Description |
|------|----------|-------------|
| 0 | `GET /password/status` | Get current password lock/OTP status |
| 1 | `POST /password/verify-current` | Verify current password |
| 2 | `POST /password/request-otp` | Send OTP to email for password change |
| 3 | `POST /password/verify-otp` | Verify OTP and set new password |
| — | `POST /password/force-lock` | Force-lock when OTP timer expires |

---

### GET `/users/password/status` 🔒

**Response `200`**
```json
{
  "is_locked": false,
  "otp_requested": false
}
```

---

### POST `/users/password/verify-current` 🔒

**Request Body:** `{ "password": "currentpassword" }`  
**Response `200`:** `{ "message": "Password verified" }`

---

### POST `/users/password/request-otp` 🔒

Sends a one-time password to the user's email.  
**Response `200`:** `{ "message": "OTP sent" }`

---

### POST `/users/password/verify-otp` 🔒

Verify OTP and update to a new password.

**Request Body**
```json
{
  "otp": "123456",
  "newPassword": "NewSecure789!"
}
```

**Response `200`:** `{ "message": "Password updated successfully" }`

---

### POST `/users/password/force-lock` 🔒

Force-lock the password change flow when the OTP timer expires.  
**Response `200`:** `{ "message": "Password change locked" }`

---

## 6. Roles

Base path: `/user-management`

### GET `/user-management/roles` 🔒

Retrieve all available user roles.

**Response `200`**
```json
{
  "roles": [
    { "role_id": 1, "role_name": "Administrator" },
    { "role_id": 2, "role_name": "Officer" }
  ]
}
```

---

## 7. Health Check

### GET `/health`

Check if the server is running. No authentication required.

**Response `200`**
```json
{
  "status": "ok",
  "timestamp": "2025-03-13T00:00:00.000Z"
}
```

---

## 8. Error Responses

All endpoints return errors in this format:

```json
{
  "message": "Description of the error"
}
```

| Status | Meaning                              |
|--------|--------------------------------------|
| `400`  | Bad Request — invalid or missing input |
| `401`  | Unauthorized — missing or invalid token |
| `403`  | Forbidden — insufficient permissions |
| `404`  | Not Found — resource does not exist  |
| `409`  | Conflict — e.g. email already in use |
| `500`  | Internal Server Error                |

---

## Token Details

- Tokens are **JWTs** signed with `JWT_SECRET` (from `.env`)
- Default expiry: **24 hours** (configurable via `JWT_EXPIRY` env var)
- Tokens are stored **hashed** (SHA-256) in the `tokens` table
- A token is invalid if it is expired, revoked, or if the user account is `deactivated`, `locked`, or `unverified`
- Use `POST /auth/logout` to revoke the current token
- Use `POST /auth/logout-all` to revoke all tokens for the user

---

---

## 9. PSGC Hook (Frontend)

**File:** `usePSGC.js`  
**Source:** [PSGC API](https://psgc.gitlab.io/api) — Philippine Standard Geographic Code

A React hook that provides cascading dropdown data for Philippine address fields: Region → Province → City/Municipality → Barangay.

---

### Usage

```jsx
import { usePSGC } from "./usePSGC";

function AddressForm() {
  const { regions, loadingRegions, fetchProvinces, fetchCities, fetchBarangays } = usePSGC();
  // ...
}
```

---

### Returned Values

| Name              | Type       | Description                                              |
|-------------------|------------|----------------------------------------------------------|
| `regions`         | `array`    | List of all regions, sorted A–Z. Loaded on mount.        |
| `loadingRegions`  | `boolean`  | `true` while regions are being fetched.                  |
| `fetchProvinces`  | `function` | Fetches provinces for a given region code.               |
| `fetchCities`     | `function` | Fetches cities/municipalities for a given province code. |
| `fetchBarangays`  | `function` | Fetches barangays for a given city/municipality code.    |

---

### Functions

#### `fetchProvinces(regionCode)`

Fetches all provinces under a region.

```js
const provinces = await fetchProvinces("03"); // Region III
```

| Param        | Type   | Description              |
|--------------|--------|--------------------------|
| `regionCode` | string | PSGC code of the region  |

**Returns:** `Promise<Province[]>` — sorted A–Z. Returns `[]` on error.

---

#### `fetchCities(provinceCode)`

Fetches all cities and municipalities under a province.

```js
const cities = await fetchCities("0349");
```

| Param          | Type   | Description               |
|----------------|--------|---------------------------|
| `provinceCode` | string | PSGC code of the province |

**Returns:** `Promise<CityMunicipality[]>` — sorted A–Z. Returns `[]` on error.

---

#### `fetchBarangays(cityCode)`

Fetches all barangays under a city or municipality.

```js
const barangays = await fetchBarangays("034904");
```

| Param      | Type   | Description                        |
|------------|--------|------------------------------------|
| `cityCode` | string | PSGC code of the city/municipality |

**Returns:** `Promise<Barangay[]>` — sorted A–Z. Returns `[]` on error.

---

### Data Shape

Each item in the returned arrays follows this structure from the PSGC API:

```json
{
  "code": "030000000",
  "name": "REGION III (CENTRAL LUZON)"
}
```

---

### External API Endpoints Used

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `https://psgc.gitlab.io/api/regions/` | All regions |
| `GET` | `https://psgc.gitlab.io/api/regions/{regionCode}/provinces/` | Provinces by region |
| `GET` | `https://psgc.gitlab.io/api/provinces/{provinceCode}/cities-municipalities/` | Cities/municipalities by province |
| `GET` | `https://psgc.gitlab.io/api/cities-municipalities/{cityCode}/barangays/` | Barangays by city |

---

*Generated from BANTAY System backend source — `package.json` v1.0.0*