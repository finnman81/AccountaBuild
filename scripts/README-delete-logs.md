# Delete Duplicate Logs Script

This script helps you delete duplicate logs from Firestore for a specific date.

## Prerequisites

1. **Install Firebase Admin SDK** (one-time setup):
   ```bash
   npm install --save-dev firebase-admin
   ```

2. **Authenticate with Firebase** (choose one method):

   **Option A: Using Google Cloud SDK (Recommended)**
   ```bash
   # Install gcloud CLI if you don't have it
   # Then authenticate:
   gcloud auth application-default login
   ```

   **Option B: Using Service Account Key**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely
   - Set environment variable:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"
     ```

## Usage

```bash
node scripts/delete-duplicate-logs.js <projectId> <groupId> <date> [strategy]
```

### Parameters

- **projectId**: Your Firebase project ID
- **groupId**: The group ID that has duplicate logs
- **date**: Date in format `YYYY-MM-DD` (e.g., `2026-01-19`)
- **strategy** (optional): One of:
  - `duplicates` (default): Keep one of each unique entry, delete duplicates
  - `all`: Delete ALL logs for the date (nuclear option)
  - `apple_health`: Delete only apple_health logs for the date

### Examples

```bash
# Delete duplicates (recommended)
node scripts/delete-duplicate-logs.js my-project-id my-group-id 2026-01-19 duplicates

# Delete all logs for the date
node scripts/delete-duplicate-logs.js my-project-id my-group-id 2026-01-19 all

# Delete only apple_health logs
node scripts/delete-duplicate-logs.js my-project-id my-group-id 2026-01-19 apple_health
```

## How It Works

### Strategy: `duplicates` (Recommended)

The script identifies duplicates based on:

- **Calories**: Same calorie value + meal type + source
- **Workouts**: Same workout type + duration (within 1 minute) + source  
- **Weight**: Same weight value (within 0.1 lb) + source

It keeps the **first occurrence** of each unique entry and deletes the rest.

### Safety Features

- Shows preview of what will be deleted before proceeding
- 5-second countdown to cancel (Ctrl+C)
- Processes deletions in batches of 500 (Firestore limit)
- Shows progress as it deletes

## Finding Your Project ID and Group ID

1. **Project ID**: Check Firebase Console → Project Settings → General
2. **Group ID**: Check your Firestore database → `groups` collection → find the group document ID
