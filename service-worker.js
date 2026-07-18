// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js', {
            scope: '/'
        }).then(function(registration) {
            console.log('[PWA] Service Worker registered:', registration.scope);
            
            // Check for updates
            registration.addEventListener('updatefound', function() {
                var newWorker = registration.installing;
                newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[PWA] New version available — please refresh.');
                        // Show update notification to user
                    }
                });
            });
        }).catch(function(error) {
            console.error('[PWA] Service Worker registration failed:', error);
        });
    });
}
