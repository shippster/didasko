/* Didasko configuration — the only file you need to edit before uploading.
   See SETUP.md for where each value comes from. */
window.DIDASKO_CONFIG = {
  // Public address of the app once it's online (used in the join links and QR codes).
  // Leave empty to use whatever address the app is opened from.
  appUrl: 'https://didasko.micahshippee.com/',

  // Firebase project settings (Firebase console → Project settings → Your apps → Web app → Config).
  // These values are designed to be public; access is controlled by database.rules.json.
  firebase: {
    apiKey: 'AIzaSyCNqRO-2mPdphuzoSt-n3msYgTv3KxJzCU',
    authDomain: 'didasko-da534.firebaseapp.com',
    databaseURL: 'https://didasko-da534-default-rtdb.firebaseio.com',
    projectId: 'didasko-da534',
    appId: '1:226988581461:web:128a1b2759308f81d2aadc'
  },

  // Free AI for everyone (no key needed): Gemini through Firebase AI Logic on the no-cost Spark plan.
  // Needs App Check with a reCAPTCHA Enterprise site key (see SETUP.md). Set enabled: false to turn it off.
  freeAI: {
    enabled: true,
    model: 'gemini-3.5-flash-lite',
    recaptchaSiteKey: '6LeyOAAuAAAAADH6XVU23wRcW5su1ssPCf1jnRtt'
  },

  // Optional: limit Microsoft sign-in to one school tenant (e.g. 'yourschool.onmicrosoft.com'). Leave empty for any Microsoft account.
  microsoftTenant: '',

  // Newsletter: everyone who creates an account is added to this list.
  newsletter: {
    enabled: true,
    listName: 'micahshippee.com blog',
    notice: 'Creating an account also subscribes you to blog emails from Micah Shippee at micahshippee.com. You can unsubscribe at any time using the link in any email.',
    // WordPress.com / Jetpack subscriptions for micahshippee.com. WordPress.com sends its own confirmation email.
    wordpressBlogId: 21768516,
    wordpressSubscribeUrl: 'https://wordpress.com/email-subscriptions',
    // Optional extra destination (Zapier, Make, Mailchimp form endpoint…). Receives {email, name, source}.
    webhookUrl: '',
    // Set to true to require a tick box instead of automatic sign-up (recommended for EU, UK and Canadian users).
    requireCheckbox: false,
    checkboxLabel: 'Yes, subscribe me to blog emails from micahshippee.com.'
  }
};
