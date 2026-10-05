const { asyncHandler } = require('../middleware/errorHandler');
const JedCustomerRequest = require('../models/JedCustomerRequest');
const FinanceRevenue = require('../models/FinanceRevenue');
const User = require('../models/User');
const { allowedDiscoIds, allowedDiscoCodes } = require('../utils/discoAccess');

const getDashboardStats = asyncHandler(async (req, res) => {
    // Every figure is limited to the caller's discos (SUPERADMIN: all). The
    // JED-only keys stay in the response as 0 for anyone without JED, so
    // existing clients keep reading the same shape.
    const discoCodes = await allowedDiscoCodes(req.user);
    const seesJed = !discoCodes || discoCodes.includes('JED');

    const pendingRequests = seesJed ? await JedCustomerRequest.count({ status: 'PAID' }) : 0;
    const completedRequests = seesJed ? await JedCustomerRequest.count({ status: 'COMPLETED' }) : 0;
    const activeInstallers = (await User.findAll({
        role: 'INSTALLER',
        isActive: true,
        discoIds: allowedDiscoIds(req.user)
    })).pagination.totalCount;

    // totalRevenue keeps its original meaning -- JED, COMPLETED only -- because
    // existing clients read it. The all-disco figure is added alongside rather
    // than redefining the key under them, and matches /finance/revenue/summary.
    const totalRevenue = seesJed ? await JedCustomerRequest.sum('amount', { status: 'COMPLETED' }) : 0;
    const totalRevenueAllDiscos = await FinanceRevenue.totalRevenue({ discoCodes });

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
