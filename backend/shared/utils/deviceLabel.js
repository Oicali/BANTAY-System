// backend/shared/utils/deviceLabel.js
const parseDeviceLabel = (userAgent, deviceType) => {
  const ua = userAgent || "";
  let browser = "Unknown Browser";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome/i.test(ua)) browser = "Chrome";
  else if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";

  let os = "";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";
  if (deviceType === "mobile" && !os) os = "Mobile";

  return os ? `${browser} on ${os}` : browser;
};

module.exports = { parseDeviceLabel };