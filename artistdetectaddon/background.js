// Gelbooru Cross-Tab Artist Tracker Background Script
(function() {
    'use strict';
    
    // Storage for tracking artists across tabs
    let tabArtists = {}; // { tabId: { artists: [], url: '', title: '' } }
    
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'ARTISTS_DETECTED') {
            handleArtistsDetected(message, sender.tab);
        } else if (message.type === 'GET_CROSS_TAB_INFO') {
            sendResponse(getCrossTabInfo(message.artists, sender.tab.id));
        }
    });
    
    // Handle when artists are detected in a tab
    function handleArtistsDetected(message, tab) {
        const tabId = tab.id;
        const artists = message.artists;
        
        // Store this tab's artists
        tabArtists[tabId] = {
            artists: artists,
            url: tab.url,
            title: tab.title,
            timestamp: Date.now()
        };
        
        console.log('Background: Artists detected in tab', tabId, ':', artists);
        
        // Check for duplicates across other tabs
        const duplicates = findDuplicateArtists(artists, tabId);
        
        if (duplicates.length > 0) {
            // Send duplicate info back to the content script
            chrome.tabs.sendMessage(tabId, {
                type: 'DUPLICATE_ARTISTS_FOUND',
                duplicates: duplicates
            });
        }
    }
    
    // Find duplicate artists across other tabs
    function findDuplicateArtists(currentArtists, currentTabId) {
        const duplicates = [];
        
        for (const artist of currentArtists) {
            const otherTabs = [];
            
            // Check all other tabs for this artist
            for (const [tabId, tabData] of Object.entries(tabArtists)) {
                if (parseInt(tabId) !== currentTabId && tabData.artists.includes(artist)) {
                    otherTabs.push({
                        tabId: parseInt(tabId),
                        url: tabData.url,
                        title: tabData.title,
                        timestamp: tabData.timestamp
                    });
                }
            }
            
            if (otherTabs.length > 0) {
                duplicates.push({
                    artist: artist,
                    otherTabs: otherTabs,
                    totalTabs: otherTabs.length + 1 // +1 for current tab
                });
            }
        }
        
        return duplicates;
    }
    
    // Get cross-tab information for specific artists
    function getCrossTabInfo(artists, currentTabId) {
        const info = {};
        
        for (const artist of artists) {
            const tabs = [];
            
            for (const [tabId, tabData] of Object.entries(tabArtists)) {
                if (tabData.artists.includes(artist)) {
                    tabs.push({
                        tabId: parseInt(tabId),
                        url: tabData.url,
                        title: tabData.title,
                        isCurrent: parseInt(tabId) === currentTabId,
                        timestamp: tabData.timestamp
                    });
                }
            }
            
            if (tabs.length > 1) {
                info[artist] = tabs;
            }
        }
        
        return info;
    }
    
    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
        delete tabArtists[tabId];
        console.log('Background: Cleaned up data for closed tab', tabId);
    });
    
    // Clean up when tabs are updated (navigated away from Gelbooru)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url && !changeInfo.url.includes('gelbooru.com')) {
            delete tabArtists[tabId];
            console.log('Background: Cleaned up data for tab navigated away from Gelbooru', tabId);
        }
    });
    
    // Periodic cleanup of stale data (tabs that might have been missed)
    setInterval(() => {
        chrome.tabs.query({}, (tabs) => {
            const activeTabIds = new Set(tabs.map(tab => tab.id));
            
            for (const tabId in tabArtists) {
                if (!activeTabIds.has(parseInt(tabId))) {
                    delete tabArtists[parseInt(tabId)];
                }
            }
        });
    }, 60000); // Clean up every minute
    
})();