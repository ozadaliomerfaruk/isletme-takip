const jwt = require('jsonwebtoken');
const fs = require('fs');

// Apple Developer bilgileri
const teamId = '43WRJ4G6TP';
const keyId = 'J2D248YY2D';
const clientId = 'com.isletmetakip.app'; // Bundle ID

// Private key
const privateKey = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQggaNpsWb8Mtk0lD1e
0zc4idmXibhbsMa+t4s45BlAHaagCgYIKoZIzj0DAQehRANCAAT8A6Mvj8ONuW5f
I/xJFWHSYhi8gmVZE4nP+Bz137/FmEB8u9dE6/XA0nlVAzsihx6bb2mDc39Pg3i1
REnO3x8+
-----END PRIVATE KEY-----`;

// JWT oluştur (6 ay geçerli)
const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  audience: 'https://appleid.apple.com',
  issuer: teamId,
  subject: clientId,
  keyid: keyId,
});

console.log('=== Apple Client Secret (JWT) ===\n');
console.log(token);
console.log('\n=== Bu token\'ı Supabase Apple Secret Key alanına yapıştırın ===');
