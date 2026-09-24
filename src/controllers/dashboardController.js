const { asyncHandler } = require('../middleware/errorHandler');
const JedCustomerRequest = require('../models/JedCustomerRequest');
const FinanceRevenue = require('../models/FinanceRevenue');
const User = require('../models/User');

const getDashboardStats = asyncHandler(async (req, res) => {
    const pendingRequests = await JedCustomerRequest.count({ status: 'PAID' });
    const completedRequests = await JedCustomerRequest.count({ status: 'COMPLETED' });
    const activeInstallers = (await User.findAll({ role: 'INSTALLER', isActive: true })).pagination.totalCount;

    // totalRevenue keeps its original meaning -- JED, COMPLETED only -- because
    // existing clients read it. The all-disco figure is added alongside rather
    // than redefining the key under them, and matches /finance/revenue/summary.
    const totalRevenue = await JedCustomerRequest.sum('amount', { status: 'COMPLETED' });
    const totalRevenueAllDiscos = await FinanceRevenue.totalRevenue();

    res.json({
        success: true,
        data: {
            pendingRequests,
            completedRequests,
            activeInstallers,
            totalRevenue,
            totalRevenueAllDiscos
        }
    });
});

module.exports = {
    getDashboardStats
};