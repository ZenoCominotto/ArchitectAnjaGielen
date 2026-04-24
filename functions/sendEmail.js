const nodemailer = require("nodemailer");

const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const rateLimitStore = new Map();

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers,
        body: JSON.stringify(body)
    };
}

function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function getClientIp(event) {
    const forwarded = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return event.headers?.["client-ip"] ||
        event.headers?.["Client-Ip"] ||
        event.requestContext?.identity?.sourceIp ||
        "unknown";
}

function pruneRateLimitStore(now = Date.now()) {
    for (const [ip, hits] of rateLimitStore.entries()) {
        const recentHits = hits.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
        if (recentHits.length === 0) {
            rateLimitStore.delete(ip);
        } else {
            rateLimitStore.set(ip, recentHits);
        }
    }
}

function checkRateLimit(ip, now = Date.now()) {
    pruneRateLimitStore(now);

    const hits = rateLimitStore.get(ip) || [];
    const recentHits = hits.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

    if (recentHits.length >= RATE_LIMIT_MAX) {
        rateLimitStore.set(ip, recentHits);
        return false;
    }

    recentHits.push(now);
    rateLimitStore.set(ip, recentHits);
    return true;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

function hasLongToken(text) {
    return text.split(/\s+/).some((token) => {
        const cleanToken = token.replace(/[.,!?;:()[\]{}'"`]/g, "");
        return cleanToken.length >= 18 && /^[a-zA-Z0-9]+$/.test(cleanToken);
    });
}

function looksLikeRandomString(text) {
    const compact = text.replace(/\s+/g, "");

    if (compact.length >= 14 && /^[a-zA-Z0-9]+$/.test(compact)) {
        const hasLower = /[a-z]/.test(compact);
        const hasUpper = /[A-Z]/.test(compact);
        const hasDigit = /\d/.test(compact);
        const mixedCase = hasLower && hasUpper;
        const vowelCount = (compact.match(/[aeiouAEIOU]/g) || []).length;
        const vowelRatio = vowelCount / compact.length;

        if ((mixedCase || hasDigit) && vowelRatio < 0.45) {
            return true;
        }
    }

    return hasLongToken(text);
}

function validateSubmission(data) {
    const name = normalizeText(data.name);
    const email = normalizeText(data.email).toLowerCase();
    const message = normalizeText(data.message);
    const honeypot = normalizeText(data.website);
    const captchaToken = normalizeText(data.captchaToken);

    if (honeypot) {
        return { ok: false, reason: "honeypot", publicMessage: "Je bericht kon niet worden verstuurd. Probeer het later opnieuw." };
    }

    if (!name || name.length < 2 || name.length > 80) {
        return { ok: false, reason: "invalid_name", publicMessage: "Vul een geldige naam in." };
    }

    if (looksLikeRandomString(name) || !/[a-zA-ZÀ-ÿ]/.test(name)) {
        return { ok: false, reason: "spam_name", publicMessage: "Vul een geldige naam in." };
    }

    if (!isValidEmail(email)) {
        return { ok: false, reason: "invalid_email", publicMessage: "Vul een geldig e-mailadres in." };
    }

    if (!message || message.length < 20 || message.length > 4000) {
        return { ok: false, reason: "invalid_message_length", publicMessage: "Schrijf een bericht van minstens 20 tekens." };
    }

    if (looksLikeRandomString(message)) {
        return { ok: false, reason: "spam_message", publicMessage: "Je bericht kon niet worden verstuurd. Controleer je bericht en probeer opnieuw." };
    }

    return {
        ok: true,
        value: {
            name,
            email,
            message,
            captchaToken
        }
    };
}

function safeLogBlocked(reason, event, data = {}) {
    const ip = getClientIp(event);
    console.warn("Blocked contact form submission", {
        reason,
        ipSuffix: ip === "unknown" ? "unknown" : ip.slice(-7),
        nameLength: normalizeText(data.name).length,
        messageLength: normalizeText(data.message).length,
        hasEmail: Boolean(normalizeText(data.email)),
        timestamp: new Date().toISOString()
    });
}

async function verifyCaptcha(token, ip) {
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY;

    if (!recaptchaSecret && !hcaptchaSecret) {
        return { ok: true, skipped: true };
    }

    if (!token) {
        return { ok: false, reason: "missing_captcha" };
    }

    const provider = hcaptchaSecret ? "hcaptcha" : "recaptcha";
    const secret = hcaptchaSecret || recaptchaSecret;
    const endpoint = provider === "hcaptcha"
        ? "https://hcaptcha.com/siteverify"
        : "https://www.google.com/recaptcha/api/siteverify";

    const params = new URLSearchParams({
        secret,
        response: token
    });

    if (ip && ip !== "unknown") {
        params.set("remoteip", ip);
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });
    const result = await response.json();

    return result.success ? { ok: true, provider } : { ok: false, reason: `failed_${provider}` };
}

async function sendContactEmail(data, transporterFactory = nodemailer.createTransport) {
    const emailUser = process.env.EMAIL_NEW;
    const emailPass = process.env.EMAIL_PASS_NEW;

    if (!emailUser || !emailPass) {
        throw new Error("Email server is niet correct geconfigureerd.");
    }

    const transporter = transporterFactory({
        service: "gmail",
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });

    await transporter.verify();

    return transporter.sendMail({
        from: `"Architect Gielen website" <${emailUser}>`,
        to: "architecgielen.site@gmail.com",
        subject: `Nieuw bericht van ${data.name}`,
        text: data.message,
        replyTo: data.email
    });
}

async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    if (event.httpMethod !== "POST") {
        return jsonResponse(405, { message: "Methode niet toegestaan." });
    }

    let data;
    try {
        data = JSON.parse(event.body || "{}");
    } catch (error) {
        return jsonResponse(400, { message: "Fout bij lezen van formuliergegevens." });
    }

    const ip = getClientIp(event);

    if (!checkRateLimit(ip)) {
        safeLogBlocked("rate_limit", event, data);
        return jsonResponse(429, { message: "Te veel pogingen. Probeer het over enkele minuten opnieuw." });
    }

    const validation = validateSubmission(data);
    if (!validation.ok) {
        safeLogBlocked(validation.reason, event, data);
        return jsonResponse(400, { message: validation.publicMessage });
    }

    try {
        const captcha = await verifyCaptcha(validation.value.captchaToken, ip);
        if (!captcha.ok) {
            safeLogBlocked(captcha.reason, event, data);
            return jsonResponse(400, { message: "Je bericht kon niet worden verstuurd. Probeer het later opnieuw." });
        }

        const info = await sendContactEmail(validation.value);

        return jsonResponse(200, {
            message: "Email succesvol verstuurd!",
            messageId: info.messageId
        });
    } catch (error) {
        console.error("Contact form mail error", {
            message: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        return jsonResponse(500, { message: "Fout bij verzenden email." });
    }
}

exports.handler = handler;
exports._test = {
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
    checkRateLimit,
    getClientIp,
    hasLongToken,
    isValidEmail,
    looksLikeRandomString,
    rateLimitStore,
    validateSubmission
};
