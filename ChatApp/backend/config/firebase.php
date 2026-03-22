<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Firebase Credentials
    |--------------------------------------------------------------------------
    |
    | Path to the Firebase service account JSON file.
    | This file contains the credentials needed to authenticate with Firebase.
    |
    */
    'credentials' => env('FIREBASE_CREDENTIALS', storage_path('firebase/service-account.json')),

    /*
    |--------------------------------------------------------------------------
    | Firebase Project ID
    |--------------------------------------------------------------------------
    |
    | Your Firebase project ID from the Firebase console.
    |
    */
    'project_id' => env('FIREBASE_PROJECT_ID', ''),

    /*
    |--------------------------------------------------------------------------
    | FCM API URL
    |--------------------------------------------------------------------------
    |
    | The Firebase Cloud Messaging API endpoint.
    |
    */
    'fcm_url' => 'https://fcm.googleapis.com/v1/projects/' . env('FIREBASE_PROJECT_ID', '') . '/messages:send',
];
