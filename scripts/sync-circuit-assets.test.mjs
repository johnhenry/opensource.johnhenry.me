import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireVersion } from './sync-circuit-assets.mjs';

test('requireVersion: passes through a valid version string', () => {
  assert.equal(requireVersion('@erisera-code/circuit', '0.1.0'), '0.1.0');
});

test('requireVersion: throws a clear error for undefined (missing version field)', () => {
  assert.throws(
    () => requireVersion('@erisera-code/circuit', undefined),
    /@erisera-code\/circuit's package\.json is missing a version field/
  );
});

test('requireVersion: throws for a blank/whitespace-only version', () => {
  assert.throws(
    () => requireVersion('@erisera-code/circuit', '   '),
    /@erisera-code\/circuit's package\.json is missing a version field/
  );
});

test('requireVersion: throws for a non-string version', () => {
  assert.throws(() => requireVersion('@erisera-code/circuit', 123), /missing a version field/);
});

test('requireVersion: never silently produces the literal string "undefined"', () => {
  // This is the actual bug: `template.replaceAll('{{CIRCUIT_VERSION}}', undefined)`
  // coerces to "undefined" instead of throwing. Guard the coercion path directly.
  assert.throws(() => {
    const version = requireVersion('@erisera-code/circuit', undefined);
    'v{{CIRCUIT_VERSION}}'.replaceAll('{{CIRCUIT_VERSION}}', version);
  });
});
