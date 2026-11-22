// Portable SHA-256 in C, for platforms that do not ship one (the browser, a PC).
// On a board, prefer the chip's own, which usually has hardware acceleration.
#include "sha256.h"

#include <string.h>

static const uint32_t K256[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};

static uint32_t rotr(uint32_t v, unsigned n) { return (v >> n) | (v << (32 - n)); }

static void block(uint32_t h[8], const uint8_t b[64]) {
  uint32_t w[64], a[8];
  for (int i = 0; i < 16; i++)
    w[i] = (uint32_t)b[4 * i] << 24 | (uint32_t)b[4 * i + 1] << 16 | (uint32_t)b[4 * i + 2] << 8 | b[4 * i + 3];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  memcpy(a, h, sizeof a);
  for (int i = 0; i < 64; i++) {
    uint32_t s1 = rotr(a[4], 6) ^ rotr(a[4], 11) ^ rotr(a[4], 25);
    uint32_t ch = (a[4] & a[5]) ^ (~a[4] & a[6]);
    uint32_t t1 = a[7] + s1 + ch + K256[i] + w[i];
    uint32_t s0 = rotr(a[0], 2) ^ rotr(a[0], 13) ^ rotr(a[0], 22);
    uint32_t maj = (a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]);
    uint32_t t2 = s0 + maj;
    a[7] = a[6];
    a[6] = a[5];
    a[5] = a[4];
    a[4] = a[3] + t1;
    a[3] = a[2];
    a[2] = a[1];
    a[1] = a[0];
    a[0] = t1 + t2;
  }
  for (int i = 0; i < 8; i++) h[i] += a[i];
}

void stl_sha256(const uint8_t *data, size_t n, uint8_t out[32]) {
  uint32_t h[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  uint8_t last[64];
  size_t i = 0;
  for (; i + 64 <= n; i += 64) block(h, data + i);
  size_t rest = n - i;
  memcpy(last, data + i, rest);
  last[rest++] = 0x80;
  if (rest > 56) {
    memset(last + rest, 0, 64 - rest);
    block(h, last);
    rest = 0;
  }
  memset(last + rest, 0, 56 - rest);
  uint64_t bits = (uint64_t)n * 8;
  for (int j = 0; j < 8; j++) last[56 + j] = (uint8_t)(bits >> (56 - 8 * j));
  block(h, last);
  for (int j = 0; j < 8; j++) {
    out[4 * j] = (uint8_t)(h[j] >> 24);
    out[4 * j + 1] = (uint8_t)(h[j] >> 16);
    out[4 * j + 2] = (uint8_t)(h[j] >> 8);
    out[4 * j + 3] = (uint8_t)h[j];
  }
}
