/**
 * Connection Cache Utility
 * 
 * This module provides a centralized in-memory store for tracking active user connections.
 * It's used to maintain the online status of users across the application.
 */

// In-memory store for active connections
// Format: Map<userId, lastSeenTimestamp>
const activeConnections = new Map();

/**
 * Add or update a user's connection
 * @param {string} userId - The ID of the user
 * @returns {number} The current timestamp for the connection
 */
const updateConnection = (userId) => {
  const now = Date.now();
  activeConnections.set(userId, now);
  return now;
};

/**
 * Remove a user's connection
 * @param {string} userId - The ID of the user to remove
 * @returns {boolean} True if the user was connected and removed, false otherwise
 */
const removeConnection = (userId) => {
  return activeConnections.delete(userId);
};

/**
 * Check if a user is currently connected
 * @param {string} userId - The ID of the user to check
 * @returns {boolean} True if the user is connected
 */
const isUserConnected = (userId) => {
  return activeConnections.has(userId);
};

/**
 * Get the last seen timestamp for a user
 * @param {string} userId - The ID of the user
 * @returns {number|null} The timestamp when the user was last seen, or null if not found
 */
const getLastSeen = (userId) => {
  return activeConnections.get(userId) || null;
};

/**
 * Get all active user IDs
 * @returns {string[]} Array of user IDs that are currently connected
 */
const getConnectedUserIds = () => {
  return Array.from(activeConnections.keys());
};

/**
 * Get the number of active connections
 * @returns {number} The number of active connections
 */
const getConnectionCount = () => {
  return activeConnections.size;
};

/**
 * Clear all connections (for testing purposes)
 */
const clearAllConnections = () => {
  activeConnections.clear();
};

// Export the connection cache and utility functions
module.exports = {
  // The underlying Map
  connections: activeConnections,
  
  // Utility functions
  updateConnection,
  removeConnection,
  isUserConnected,
  getLastSeen,
  getConnectedUserIds,
  getConnectionCount,
  clearAllConnections
};

// Log the current connection count periodically for debugging
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    console.log(`[${new Date().toISOString()}] Active connections: ${activeConnections.size}`);
  }, 60000); // Log every minute
}
