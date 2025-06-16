// Gelbooru Cross-Tab Artist Tracker Content Script
(function() {
    'use strict';
    
    let detectedArtists = [];
    let duplicateNotificationShown = false;
    
    // Function to detect artist tags on the current page
    function detectArtistTags() {
        const artistTags = [];
        
        console.log('Content: Starting artist detection...');
        
        // Method 1: Direct search for artist: links (most reliable)
        const artistLinks = document.querySelectorAll('a[href*="artist:"]');
        console.log('Content: Found', artistLinks.length, 'artist: links');
        
        artistLinks.forEach(link => {
            const artistName = link.textContent.trim();
            if (artistName && !artistTags.includes(artistName)) {
                artistTags.push(artistName);
                console.log('Found artist via direct artist: link:', artistName);
            }
        });
        
        // Method 2: Look for links with artist tags in their URLs
        const tagLinks = document.querySelectorAll('a[href*="tags="]');
        console.log('Content: Found', tagLinks.length, 'tag links');
        
        tagLinks.forEach(link => {
            const href = link.getAttribute('href');
            const artistName = link.textContent.trim();
            
            // Check if the URL contains artist: in the tags parameter
            if (href && href.includes('artist:') && artistName) {
                if (!artistTags.includes(artistName)) {
                    artistTags.push(artistName);
                    console.log('Found artist via tag URL:', artistName);
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
                console.log('Found Artist header element');
                foundArtistSection = true;
                
                // Strategy 1: Look in the immediate parent and siblings
                let container = element.parentElement;
                if (container) {
                    const nearbyLinks = container.querySelectorAll('a');
                    console.log('Found', nearbyLinks.length, 'links in Artist container');
                    
                    nearbyLinks.forEach(link => {
                        const href = link.getAttribute('href');
                        const artistName = link.textContent.trim();
                        
                        console.log('Checking link:', artistName, 'href:', href);
                        
                        if (href && artistName && href.includes('tags=') && !artistTags.includes(artistName)) {
                            artistTags.push(artistName);
                            console.log('Found artist via Artist container:', artistName);
                        }
                    });
                }
                
                // Strategy 2: Look for red colored links in the whole document (common for artist tags)
                const allPageLinks = document.querySelectorAll('a[href*="tags="]');
                console.log('Checking', allPageLinks.length, 'page links for red color');
                
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
                        console.log('Found red link:', artistName, 'color:', computedStyle.color);
                        artistTags.push(artistName);
                        console.log('Found artist via red color:', artistName);
                    }
                });
                
                break;
            }
        }
        
        // Method 4: Fallback - look for any links that might be artists based on URL patterns
        if (artistTags.length === 0) {
            console.log('No artists found yet, trying fallback detection...');
            
            const allPageLinks = document.querySelectorAll('a[href*="tags="]');
            allPageLinks.forEach(link => {
                const href = link.getAttribute('href');
                const linkText = link.textContent.trim();
                
                // Log some examples to help debug
                if (allPageLinks.length < 10 || Math.random() < 0.1) {
                    console.log('Sample link:', linkText, 'href:', href);
                }
                
                // Check for various artist tag patterns in URLs
                if (href && linkText && 
                    (href.includes('artist%3A') || // URL encoded artist:
                     href.includes('artist+') ||   // Plus encoded
                     href.includes('artist:') ||   // Direct
                     href.match(/tags=.*artist/i))) { // Any artist pattern
                    
                    if (!artistTags.includes(linkText)) {
                        artistTags.push(linkText);
                        console.log('Found artist via fallback pattern:', linkText);
                    }
                }
            });
        }
        
        console.log('Content: Detected artists:', artistTags);
        console.log('Content: Found artist section:', foundArtistSection);
        
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
                    link.style.setProperty('background-color', '#4ecdc4', 'important');
                    link.style.setProperty('color', 'white', 'important');
                    link.style.fontWeight = 'bold';
                    link.style.padding = '2px 6px';
                    link.style.borderRadius = '3px';
                    link.style.margin = '2px';
                    link.style.border = '2px solid #2ca8a2';
                    link.title = `Tracked artist: ${artist}`;
                    console.log('Highlighted artist link:', artist);
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
            console.log('Content: Initializing cross-tab artist tracker on Gelbooru post page');
            
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