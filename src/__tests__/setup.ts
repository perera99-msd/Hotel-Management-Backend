// Test setup file
// Runs before each test file

// Mock environment variables
process.env.MONGO_URI = 'mongodb://localhost:27017/hotel-test';
process.env.PORT = '5000';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.com';
// Set a valid RSA private key for testing (generated test key, not for production)
process.env.FIREBASE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCuR5pzOA37XP6k
GVnLOjc5u4TwLC/mJgQ42dug+MtitPk2avwbH7GZdBE2M5yD4eaYpCy34LB+KIre
27xROM/tYGPI1XfPTMeDmwZa6/ZQha1GjyHGEcnvtgy3ZWL4AUtZi5Kr6EiKOjra
7KyaT7xMpNpz2CzwtG2Lhv1PFA+qOurMJ1+HeeraC4LACMoYbsQB50Dt0StiryFx
hIeV2VkW7apTdkSLto4gIza25kjk0cduqdWVgMbmeHmJHqI4NFWzXFKfhQX/RItP
NEGWs7LPNaQsbtLlHaOYNrmpsHervtdqn+OPqrNbfpcqYZsAQuinHJtQYXxo96g/
VDMZUlP1AgMBAAECggEABD9cAQtgcdwgG6U/hj+2uVo74POevjv2deE/ZFKz+EWj
XkNovgt9c1k8EydaXO98RIOZ0GhyPLzlt41A73TUQnuLKwmi2CNNqIQ2eTBPikJb
yQCziMWFt6km8bBPo246pSXM7xIj9HR7WzsR8NfZJcANz+14mOw40EH7ufnp8NLg
91gPCu674pr3P6sXbPoOiSPtrJRTPFpkgYgEKiMk6LGTdUN2ceTCpAL0/JXBeT2J
J9soKp6mSUYMEbh8/s45uNKpq72RwjaHqJFrsK7YM/yX5VuclznajpJjQ9/39ZDr
Me9yy6tQR9Z0m433cj6soYsFR0Xr+Qacyrq6fRQ8wQKBgQDeWttFSFpGKiIRbp6R
gKQgoBxCkQpeJkGRV4yKPPzOqb/TkJZsE/LniyJqqQrQ67gn0+lwys2trf6Qww9K
QgKi6NSLctUyUFCTzs6X62A0yhpeSVXeJ96P9HuRNJ1IgbuwmB6W1h6ggiJr+Zic
HPXC/zrBx5UAMRLiizTg4j6owQKBgQDIpoE2QZBEG1xDauyhUm9mPtGN982aXC6Y
44L1BztWFRwvLcp0mWOj5Ng/Z9pq3wOFqD6lqLXrHRiG7DI/wMl5kKY7OsCn7ErR
D09iFvIQI1nhHyjU3tU/4zWDsS5MINspP/NCNTjmEWDn1UvHwmKvGORnFzYlwhPX
o8VfJe5kNQKBgCUK8dia8x8ZSc+ppBUNX0poIg0c6KNCsE2sTieBfYRYVzLBta2P
rTnRvgwS2VBw1J8d+Jfn0VgL0or/U/7E/HdzXmVU3huhsarOGzDH76EbwkTO5tU5
wyQsUKGiKEm6AzCqRv5N8ZA/3cgrLrdjQ7YWmw1JWJNNmZ3QHyEPz+yBAoGAICWt
JggzGPZZPePvrZkLiBIgeOJu6oBCZvRskt1pwEz5iwWHHk9FC4kqrF3zPJQmeE+Q
WfJB0z2CJHvLQTOeE//84hhzrXPKONx/F3QdrEA9sjfPzus0t1urw0Gr7T6GXoGE
c+MbDqFSKVKfJY4bSXpvfaTWZA5IJ5BxmuD05NECgYAltrs4F52RwqypMyBFlnsv
dOOy2seFyZky90NgMXqGWqXU/uhB7rZgakf6Kw3W4xxO3/KY+VteWjSmJ4RsiyBL
cNA8FKReK+4B5F4iH7jy17dd3PjuyEPiFd2i/jNJDvdB8Oo7EHgAt6/QpfjHLtwj
CgdhQJynfXtjtqznYjE+Cg==
-----END PRIVATE KEY-----`;
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'test-pass';
process.env.SENDER_EMAIL = 'sender@test.com';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.TEXT_LK_API_KEY = 'test-key';
process.env.TEXT_LK_SENDER_ID = 'TestSender';
