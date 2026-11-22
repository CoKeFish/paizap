// Portable SHA-256 in C (see sha256.c).
#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void stl_sha256(const uint8_t *data, size_t n, uint8_t out[32]);

#ifdef __cplusplus
}
#endif
