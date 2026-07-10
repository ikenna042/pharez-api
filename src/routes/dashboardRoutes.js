const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /dashboard-stats:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  success:
 *                    type: boolean
 *                    description: Indicates if the request was successful
 *                  message:
 *                    type: string
 *                    example: Successfully retrieved dashboard statistics
 *                  data:
 *                    type: object
 *                    properties:
 *                      pendingRequests:
 *                        type: number
 *                        description: Total number of pending requests
 *                      completedRequests:
 *                        type: number
 *                        description: Total number of completed requests
 *                      activeInstallers:
 *                        type: number
 *                        description: Total number of active installers
 *                      totalRevenue:
 *                        type: number
 *                        description: Total revenue generated
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User does not have required permissions
 *       500:
 *         description: Internal server error
 */
 
router.get('/', 
    authenticate, 
    authorize('SUPERADMIN', 'ADMIN'), 
    dashboardController.getDashboardStats
);

module.exports = router;