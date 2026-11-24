package com.careerbridge.backend.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-unit-test-secret-1234";

    @Test
    void validTokenReturnsStudentId() {
        JwtService jwt = new JwtService(SECRET, 1);
        assertEquals(42L, jwt.verify(jwt.createToken(42L, "a@b.com")));
    }

    @Test
    void tokenSignedWithAnotherSecretIsRejected() {
        String token = new JwtService(SECRET, 1).createToken(42L, "a@b.com");
        assertNull(new JwtService("another-secret-another-secret-123456", 1).verify(token));
    }

    @Test
    void tamperedAndGarbageTokensAreRejected() {
        JwtService jwt = new JwtService(SECRET, 1);
        String token = jwt.createToken(42L, "a@b.com");
        assertNull(jwt.verify(token.substring(0, token.length() - 3) + "abc"));
        assertNull(jwt.verify("not-a-token"));
    }

    @Test
    void expiredTokenIsRejected() {
        JwtService jwt = new JwtService(SECRET, -1);
        assertNull(jwt.verify(jwt.createToken(42L, "a@b.com")));
    }

    @Test
    void missingOrShortSecretStopsStartup() {
        assertThrows(IllegalStateException.class, () -> new JwtService("", 1));
        assertThrows(IllegalStateException.class, () -> new JwtService("short", 1));
    }
}