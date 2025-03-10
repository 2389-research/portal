/**
 * API configuration for various backend providers
 */

import type { FirebaseOptions } from 'firebase/app';

interface ApiConfig {
  firebase: FirebaseOptions;
  pocketbase: {
    baseUrl: string;
  };
  flask: {
    baseUrl: string;
  };
}

export const config: ApiConfig = {
  firebase: {
    apiKey: 'AIzaSyBVr_e1ilB3WDU9URma2uLsrg8x9eVTpBg',
    authDomain: 'project-2432689628870799174.firebaseapp.com',
    projectId: 'project-2432689628870799174',
    storageBucket: 'project-2432689628870799174.firebasestorage.app',
    messagingSenderId: '617829744766',
    appId: '1:617829744766:web:579afbabd8a619bd18d82f',
    measurementId: 'G-GWY7LFQ64B',
  },
  pocketbase: {
    baseUrl: 'http://localhost:8090',
  },
  flask: {
    baseUrl: 'http://localhost:5000',
  },
};
