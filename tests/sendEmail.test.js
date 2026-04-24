const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../functions/sendEmail");

const validSubmission = {
    name: "Jan Peeters",
    email: "jan.peeters@example.com",
    message: "Hallo, ik wil graag meer informatie over een verbouwing."
};

test("accepts a valid contact form submission", () => {
    const result = _test.validateSubmission(validSubmission);

    assert.equal(result.ok, true);
    assert.equal(result.value.name, "Jan Peeters");
    assert.equal(result.value.email, "jan.peeters@example.com");
});

test("blocks submissions with a filled honeypot field", () => {
    const result = _test.validateSubmission({
        ...validSubmission,
        website: "https://spam.example"
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "honeypot");
});

test("blocks invalid email addresses", () => {
    const result = _test.validateSubmission({
        ...validSubmission,
        email: "geen-geldig-emailadres"
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_email");
});

test("blocks random-string spam in name and message", () => {
    const nameResult = _test.validateSubmission({
        ...validSubmission,
        name: "hbOXUqluzFEkUsXOBudOi"
    });
    const messageResult = _test.validateSubmission({
        ...validSubmission,
        message: "QfwGIojMJaqLECBGRDkW"
    });

    assert.equal(nameResult.ok, false);
    assert.equal(nameResult.reason, "spam_name");
    assert.equal(messageResult.ok, false);
    assert.equal(messageResult.reason, "spam_message");
});

test("rate limits more than three blocked submissions per ten minutes per IP", () => {
    const ip = "203.0.113.44";
    const now = Date.now();

    _test.rateLimitStore.clear();

    assert.equal(_test.checkRateLimit(ip, now), true);
    _test.recordBlockedAttempt(ip, now);

    assert.equal(_test.checkRateLimit(ip, now + 1000), true);
    _test.recordBlockedAttempt(ip, now + 1000);

    assert.equal(_test.checkRateLimit(ip, now + 2000), true);
    _test.recordBlockedAttempt(ip, now + 2000);

    assert.equal(_test.checkRateLimit(ip, now + 3000), false);
    assert.equal(_test.checkRateLimit(ip, now + _test.RATE_LIMIT_WINDOW_MS + 1), true);

    _test.rateLimitStore.clear();
});

test("successful submissions can clear previous blocked attempts", () => {
    const ip = "203.0.113.45";
    const now = Date.now();

    _test.rateLimitStore.clear();
    _test.recordBlockedAttempt(ip, now);
    _test.recordBlockedAttempt(ip, now + 1000);
    _test.clearBlockedAttempts(ip);

    assert.equal(_test.checkRateLimit(ip, now + 2000), true);
    assert.equal(_test.rateLimitStore.has(ip), false);

    _test.rateLimitStore.clear();
});
