// Gelbooru Cross-Tab Artist Tracker Content Script
(function() {
    'use strict';

    // Helper function to extract and clean artist names
    function extractArtistName(tagString) {
        if (!tagString) return null;

        let name = tagString;
        // Handle URL-encoded "artist:" prefix like "artist%3A"
        if (name.startsWith('artist%3A')) {
            name = decodeURIComponent(name);
        }

        // Remove "artist:" prefix if present
        if (name.startsWith('artist:')) {
            name = name.substring('artist:'.length);
        }

        // Replace underscores with spaces (common in tags) and trim
        // Also handle plus (+) encoding for spaces in URLs
        name = name.replace(/_/g, ' ').replace(/\+/g, ' ').trim();

        return name || null; // Return null if the name is empty after cleaning
    }
    
    let detectedArtists = [];
    let duplicateNotificationShown = false;
    
    // Function to detect artist tags on the current page
    function detectArtistTags() {
        const artistTags = [];
        const hostname = window.location.hostname;

        if (hostname.includes('danbooru.donmai.us')) {
            // Danbooru-specific detection
            const danbooruArtistElements = document.querySelectorAll('li.tag-type-1'); // Target 'artist' tag type
            danbooruArtistElements.forEach(element => {
                const linkElement = element.querySelector('a.search-tag[href*="tags="]');
                if (linkElement) {
                    const artistName = linkElement.textContent.trim();
                    if (artistName && !artistTags.includes(artistName)) {
                        artistTags.push(artistName);
                    }
                }
            });
        } else if (hostname.includes('gelbooru.com')) {
            // Gelbooru-specific detection
            // Method 1: Direct search for artist: links
            const artistLinks = document.querySelectorAll('a[href*="artist:"]');
            artistLinks.forEach(link => {
                // Extract artist name from href first, then textContent as fallback
                let potentialArtistName = null;
                const href = link.getAttribute('href');
                if (href) {
                    const hrefParts = href.split(':');
                    if (hrefParts.length > 1 && hrefParts[0].includes('artist')) { // e.g. artist:name or tags=...&artist:name
                        potentialArtistName = extractArtistName(hrefParts.slice(1).join(':').split('&')[0]); // Get part after "artist:" and before any other params
                    }
                }
                if (!potentialArtistName) {
                     potentialArtistName = extractArtistName(link.textContent.trim());
                }

                if (potentialArtistName && !artistTags.includes(potentialArtistName)) {
                    artistTags.push(potentialArtistName);
                }
            });
            
            // Method 2: Look for links with artist tags in their URLs (tags=artist:name)
            const tagLinks = document.querySelectorAll('a[href*="tags="]');
            tagLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    const params = new URLSearchParams(href.substring(href.indexOf('?') + 1));
                    const tags = params.get('tags');
                    if (tags) {
                        const tagParts = tags.split(/\s+/); // Split by space
                        tagParts.forEach(tag => {
                            const artistName = extractArtistName(tag); // Use helper, handles "artist:name" or "artist%3Aname"
                            if (artistName && tag.toLowerCase().startsWith('artist') && !artistTags.includes(artistName)) {
                                artistTags.push(artistName);
                            }
                        });
                    }
                }
            });

            // Method 5: Site-Specific Class-Based Detection (li.tag-type-artist)
            const artistTagElements = document.querySelectorAll('li.tag-type-artist');
            artistTagElements.forEach(liElement => {
                const linkElement = liElement.querySelector('a[href*="tags="]');
                if (linkElement) {
                    let potentialArtistName = extractArtistName(linkElement.textContent.trim());
                    if (potentialArtistName && potentialArtistName.length > 1 && !artistTags.includes(potentialArtistName)) {
                        artistTags.push(potentialArtistName);
                    }
                }
            });

            // Method 3 has been removed.

            // Method 4: Fallback - parse href for artist patterns (artist%3A, artist+, artist:) in tags=
            // This runs regardless of previous findings to catch any missed artists.
            const allPageLinksFallback = document.querySelectorAll('a[href*="tags="]');
            allPageLinksFallback.forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    const params = new URLSearchParams(href.substring(href.indexOf('?') + 1));
                    const tags = params.get('tags');
                    if (tags) {
                        const tagParts = tags.split(/\s+/); // Split by space or plus
                        tagParts.forEach(tag => {
                            // Check for artist:, artist%3A in the tag part
                            if (tag.toLowerCase().startsWith('artist:') || tag.toLowerCase().startsWith('artist%3a')) {
                                const artistName = extractArtistName(tag);
                                if (artistName && !artistTags.includes(artistName)) {
                                    artistTags.push(artistName);
                                }
                            }
                        });
                    }
                }
            });
        }

        // Deduplicate artistTags one last time to be absolutely sure.
        const uniqueArtistTags = [...new Set(artistTags)];

        if (uniqueArtistTags.length > 0) {
            detectedArtists = uniqueArtistTags;
            
            // Send artists to background script
            chrome.runtime.sendMessage({
                type: 'ARTISTS_DETECTED',
                artists: uniqueArtistTags,
                url: window.location.href,
                title: document.title
            });
            
            // Highlight artist tags
            highlightArtistTags(uniqueArtistTags);
        }
        
        return uniqueArtistTags;
    }
    
    // Highlight artist tags on the page
    function highlightArtistTags(artists) {
        artists.forEach(artist => {
            // Find all links that contain this exact artist name
            const allLinks = document.querySelectorAll('a');
            
            allLinks.forEach(link => {
                const linkText = extractArtistName(link.textContent.trim()); // Use helper for consistency
                const href = link.getAttribute('href');
                
                // Highlight if the cleaned text matches the artist name and it's a tag link
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
    
    // Check if we're on a supported post page
    function isSupportedPostPage() {
        const hostname = window.location.hostname;
        if (hostname.includes('gelbooru.com')) {
            return (window.location.pathname.includes('post') ||
                    window.location.search.includes('page=post') ||
                    window.location.search.includes('id='));
        } else if (hostname.includes('danbooru.donmai.us')) {
            // Danbooru post URLs are typically /posts/<post_id> or /posts?tags=...
            // For simplicity, activate on any page that might show posts or tags.
            // More specific checks can be added if needed, e.g., for /posts/*
            return window.location.pathname.includes('posts');
        }
        return false;
    }
    
    // Initialize the extension
    function initialize() {
        if (isSupportedPostPage()) {
            // Run detection after a short delay
            setTimeout(detectArtistTags, 1000);
            
            // Set up observer for dynamic content changes (relevant for both sites)
            const observer = new MutationObserver((mutations) => {
                let shouldRecheck = false;
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Generic check for links that might be artist tags on either site
                                if (node.querySelector &&
                                    (node.querySelector('a[href*="artist:"]') || // Gelbooru
                                     node.querySelector('li.tag-type-1 a'))) {  // Danbooru
                                    shouldRecheck = true;
                                } else if (node.matches &&
                                           (node.matches('a[href*="artist:"]') ||
                                            node.matches('li.tag-type-1 a'))) {
                                    shouldRecheck = true;
                                }
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