# Local Testing (AccountaBuild)

This app is built with Expo + React Native + Firebase. This folder contains **local tests** you can run before shipping.

## What’s included

- **Unit tests**: pure logic (formatters, viewmodels)
- **Component tests**: UI components render + basic interactions
- **Smoke tests**: screens render without crashing (Firebase calls are mocked)

## Run tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

CI mode:

```bash
npm run test:ci
```

## Notes

- Firebase/Firestore is mocked in `testing/jest.setup.ts` so tests never hit the network.
- If you later want **Firestore rules tests**, we can add a `firebase emulators:exec` harness (requires `firebase-tools`). This is optional and heavier than unit/component tests.

