// Gelbooru Cross-Tab Artist Tracker Content Script
(function() {
    'use strict';
    
    let detectedArtists = [];
    let duplicateNotificationShown = false;
    
    // Function to detect artist tags on the current page
    function detectArtistTags() {
        const artistTags = [];
        
        // Method 1: Direct search for artist: links (most reliable)
        const artistLinks = document.querySelectorAll('a[href*="artist:"]');
        
        artistLinks.forEach(link => {
            const artistName = link.textContent.trim();
            if (artistName && !artistTags.includes(artistName)) {
                artistTags.push(artistName);
            }
        });
        
        // Method 2: Look for links with artist tags in their URLs
        const tagLinks = document.querySelectorAll('a[href*="tags="]');
        
        tagLinks.forEach(link => {
            const href = link.getAttribute('href');
            const artistName = link.textContent.trim();
            
            // Check if the URL contains artist: in the tags parameter
            if (href && href.includes('artist:') && artistName) {
                if (!artistTags.includes(artistName)) {
                    artistTags.push(artistName);
                }
            }
        });
        
        // Method 3: Look for the "Artist" section header and nearby links
        const allElements = document.querySelectorAll('*');
        let foundArtistSection = false;
        
        for (let i = 0; i < allElements.length; i++) {
            const element = allElements[i];
            const text = element.textContent;
            
            // If we find an element that says exactly "Artist"
            if (text && text.trim() === 'Artist') {
                foundArtistSection = true;
                
                // Strategy 1: Look in the immediate parent and siblings
                let container = element.parentElement;
                if (container) {
                    const nearbyLinks = container.querySelectorAll('a');
                    
                    nearbyLinks.forEach(link => {
                        const href = link.getAttribute('href');
                        const artistName = link.textContent.trim();
                        
                        if (href && artistName && href.includes('tags=') && !artistTags.includes(artistName)) {
                            artistTags.push(artistName);
                        }
                    });
                }
                
                // Strategy 2: Look for red colored links in the whole document (common for artist tags)
                const allPageLinks = document.querySelectorAll('a[href*="tags="]');
                
                allPageLinks.forEach(link => {
                    const computedStyle = window.getComputedStyle(link);
                    const artistName = link.textContent.trim();
                    const href = link.getAttribute('href');
                    
                    // Check if the link is red (artist tags are often red on Gelbooru)
                    const isRed = computedStyle.color === 'rgb(255, 0, 0)' || 
                                 computedStyle.color === 'red' ||
                                 computedStyle.color.includes('255, 0, 0') ||
                                 link.style.color.includes('red');
                    
                    if (isRed && artistName && href && !artistTags.includes(artistName)) {
                        artistTags.push(artistName);
                    }
                });
                
                break;
            }
        }
        
        // Method 4: Fallback - look for any links that might be artists based on URL patterns
        if (artistTags.length === 0) {
            const allPageLinks = document.querySelectorAll('a[href*="tags="]');
            allPageLinks.forEach(link => {
                const href = link.getAttribute('href');
                const linkText = link.textContent.trim();
                
                // Check for various artist tag patterns in URLs
                if (href && linkText && 
                    (href.includes('artist%3A') || // URL encoded artist:
                     href.includes('artist+') ||   // Plus encoded
                     href.includes('artist:') ||   // Direct
                     href.match(/tags=.*artist/i))) { // Any artist pattern
                    
                    if (!artistTags.includes(linkText)) {
                        artistTags.push(linkText);
                    }
                }
            });
        }
        
        if (artistTags.length > 0) {
            detectedArtists = artistTags;
            
            // Send artists to background script
            chrome.runtime.sendMessage({
                type: 'ARTISTS_DETECTED',
                artists: artistTags,
                url: window.location.href,
                title: document.title
            });
            
            // Highlight artist tags
            highlightArtistTags(artistTags);
        }
        
        return artistTags;
    }
    
    // Highlight artist tags on the page
    function highlightArtistTags(artists) {
        artists.forEach(artist => {
            // Find all links that contain this exact artist name
            const allLinks = document.querySelectorAll('a');
            
            allLinks.forEach(link => {
                const linkText = link.textContent.trim();
                const href = link.getAttribute('href');
                
                // Highlight if the text matches the artist name and it's a tag link
                if (linkText === artist && href && 
                    (href.includes('artist:') || href.includes('tags='))) {
                    
                    link.classList.add('gelbooru-tracked-artist');
                    link.title = `Tracked artist: ${artist}`;
                }
            });
        });
    }
    
    // Show notification when duplicate artists are found
    function showDuplicateNotification(duplicates) {
        if (duplicateNotificationShown) return;
        duplicateNotificationShown = true;
        
        // Remove existing notification
        const existingNotification = document.querySelector('#gelbooru-duplicate-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification
        const notification = document.createElement('div');
        notification.id = 'gelbooru-duplicate-notification';
        notification.className = 'gelbooru-duplicate-notification';
        
        let duplicateHTML = '';
        duplicates.forEach(duplicate => {
            duplicateHTML += `
                <div class="duplicate-artist">
                    <h4>🎨 ${duplicate.artist}</h4>
                    <p>Found in ${duplicate.totalTabs} tabs:</p>
                    <ul>
                        ${duplicate.otherTabs.map(tab => `
                            <li>
                                <a href="#" onclick="chrome.tabs.update(${tab.tabId}, {active: true}); return false;">
                                    ${tab.title || 'Gelbooru Tab'}
                                </a>
                                <small>(${new Date(tab.timestamp).toLocaleTimeString()})</small>
                            </li>
                        `).join('')}
                        <li><strong>Current tab</strong></li>
                    </ul>
                    <button class="close-duplicates-btn" data-artist="${duplicate.artist}">Close Other Tabs</button>
                </div>
            `;
        });
        
        notification.innerHTML = `
            <div class="notification-header">
                <strong>🔍 Duplicate Artists Found!</strong>
                <button class="close-btn" onclick="this.parentElement.parentElement.style.display='none'">×</button>
            </div>
            <div class="notification-body">
                ${duplicateHTML}
            </div>
        `;
        
        // Insert at the top of the page
        document.body.insertBefore(notification, document.body.firstChild);
        
        // Add event listeners to the new buttons
        const closeButtons = notification.querySelectorAll('.close-duplicates-btn');
        closeButtons.forEach(button => {
            button.addEventListener('click', function(event) {
                event.preventDefault();
                const artistToClose = this.dataset.artist;
                if (artistToClose) {
                    chrome.runtime.sendMessage({
                        type: 'CLOSE_DUPLICATE_TABS',
                        artist: artistToClose
                    });
                    // Optional: Visual feedback
                    this.textContent = 'Closing...';
                    this.disabled = true;
                }
            });
        });

        // Auto-hide after 15 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                        duplicateNotificationShown = false;
                    }
                }, 500);
            }
        }, 15000);
    }
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'DUPLICATE_ARTISTS_FOUND') {
            showDuplicateNotification(message.duplicates);
        }
    });
    
    // Check if we're on a Gelbooru post page
    function isGelbooruPostPage() {
        return window.location.hostname.includes('gelbooru.com') && 
               (window.location.pathname.includes('post') || 
                window.location.search.includes('page=post') ||
                window.location.search.includes('id='));
    }
    
    // Initialize the extension
    function initialize() {
        if (isGelbooruPostPage()) {
            // Run detection after a short delay
            setTimeout(detectArtistTags, 1000);
            
            // Set up observer for dynamic content changes
            const observer = new MutationObserver((mutations) => {
                let shouldRecheck = false;
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // Check if any added nodes contain artist tag information
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE && 
                                (node.querySelector && node.querySelector('a[href*="artist:"]') ||
                                 node.matches && node.matches('a[href*="artist:"]'))) {
                                shouldRecheck = true;
                            }
                        });
                    }
                });
                
                if (shouldRecheck) {
                    setTimeout(detectArtistTags, 500);
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();