const { asyncHandler } = require('../middleware/errorHandler');
const JedCustomerRequest = require('../models/JedCustomerRequest');
const User = require('../models/User');

const getDashboardStats = asyncHandler(async (req, res) => {
    const pendingRequests = await JedCustomerRequest.count({ status: 'PAID' });
    const completedRequests = await JedCustomerRequest.count({ status: 'COMPLETED' });
    const activeInstallers = (await User.findAll({ role: 'INSTALLER', isActive: true })).pagination.totalCount;
    const totalRevenue = await JedCustomerRequest.sum('amount', { status: 'COMPLETED' });

    res.json({
        success: true,
        data: {
            pendingRequests,
            completedRequests,
            activeInstallers,
            totalRevenue
        }
    });
});

module.exports = {
    getDashboardStats
};