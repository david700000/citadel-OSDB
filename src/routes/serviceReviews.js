// src/routes/serviceReviews.js
const express = require("express");
const ServiceReview = require("../models/ServiceReview");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ─── Middleware: leader or CMS only ──────────────────────────────────────────
function requireLeaderOrCMS(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role === "cms" || req.user.role === "leader") return next();
    return res.status(403).json({ error: "Access restricted to church leaders." });
  });
}

// ─── Helper: sanitize string ─────────────────────────────────────────────────
const sanitizeStr = (val, maxLen = 1000) => {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
};

const sanitizeRating = (val) => {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1 || n > 10) return null;
  return n;
};

// ─── POST /service-reviews  (public — no auth) ───────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      full_name,
      role,
      service_date,
      service_type,
      // worship
      worship_team_leading,
      sound_audio_quality,
      song_selection,
      // ushering
      welcoming_atmosphere,
      usher_seating_order,
      offering_transitions,
      // children
      children_youth_engagement,
      children_area_safety,
      materials_teachers_prepared,
      // media
      projection_displays,
      livestream_quality,
      media_transitions,
      // punctuality
      service_start_time,
      overall_time_management,
      teams_ready_before_service,
      // comments
      highlight,
      improvement_suggestions,
    } = req.body;

    // Validate required string fields
    const cleanName = sanitizeStr(full_name, 120);
    if (!cleanName) return res.status(400).json({ error: "Full name is required." });

    const allowedRoles = ["worker", "member", "visitor", "leader", "pastor"];
    if (!allowedRoles.includes(role)) return res.status(400).json({ error: "Invalid role." });

    const allowedTypes = ["sunday_service", "midweek", "special"];
    if (!allowedTypes.includes(service_type)) return res.status(400).json({ error: "Invalid service type." });

    if (!service_date) return res.status(400).json({ error: "Service date is required." });
    const parsedDate = new Date(service_date);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: "Invalid service date." });

    // Validate all 15 ratings
    const ratingFields = {
      worship_team_leading,
      sound_audio_quality,
      song_selection,
      welcoming_atmosphere,
      usher_seating_order,
      offering_transitions,
      children_youth_engagement,
      children_area_safety,
      materials_teachers_prepared,
      projection_displays,
      livestream_quality,
      media_transitions,
      service_start_time,
      overall_time_management,
      teams_ready_before_service,
    };

    const sanitizedRatings = {};
    for (const [key, val] of Object.entries(ratingFields)) {
      const r = sanitizeRating(val);
      if (r === null) return res.status(400).json({ error: `Rating for "${key}" must be between 1 and 10.` });
      sanitizedRatings[key] = r;
    }

    const review = new ServiceReview({
      full_name: cleanName,
      role,
      service_date: parsedDate,
      service_type,
      ...sanitizedRatings,
      highlight: sanitizeStr(highlight),
      improvement_suggestions: sanitizeStr(improvement_suggestions),
    });

    await review.save();
    res.status(201).json({ message: "Review submitted successfully.", id: review._id });
  } catch (err) {
    console.error("[ServiceReviews] POST error:", err.message, err.stack);
    res.status(500).json({ error: "Failed to submit review. Please try again.", _debug: err.message, _type: err.name });
  }
});

// ─── All routes below require leader or CMS authentication ───────────────────

// ─── GET /service-reviews  (leader/CMS — paginated, filtered, searchable) ────
router.get("/", requireLeaderOrCMS, async (req, res) => {
  try {
    const {
      search,
      service_type,
      date_from,
      date_to,
      page = 1,
      limit = 20,
      sort_by = "createdAt",
      sort_order = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.full_name = { $regex: sanitizeStr(search, 100), $options: "i" };
    }

    if (service_type && service_type !== "all") {
      const allowed = ["sunday_service", "midweek", "special"];
      if (allowed.includes(service_type)) query.service_type = service_type;
    }

    if (date_from || date_to) {
      query.service_date = {};
      if (date_from) query.service_date.$gte = new Date(date_from);
      if (date_to) {
        const to = new Date(date_to);
        to.setHours(23, 59, 59, 999);
        query.service_date.$lte = to;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const allowedSortFields = ["createdAt", "service_date", "overall_average", "full_name"];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : "createdAt";
    const sortDir = sort_order === "asc" ? 1 : -1;

    const [reviews, total] = await Promise.all([
      ServiceReview.find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ServiceReview.countDocuments(query),
    ]);

    res.json({
      reviews,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("[ServiceReviews] GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch reviews." });
  }
});

// ─── GET /service-reviews/stats  (leader/CMS — summary statistics) ──────────
router.get("/stats", requireLeaderOrCMS, async (req, res) => {
  try {
    const [totals, recentList, byType, ratingBreakdown] = await Promise.all([
      // Total submissions + average rating
      ServiceReview.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avg_rating: { $avg: "$overall_average" },
          },
        },
      ]),

      // Recent 5 submissions
      ServiceReview.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("full_name role service_type service_date overall_average createdAt")
        .lean(),

      // Submissions by service type
      ServiceReview.aggregate([
        { $group: { _id: "$service_type", count: { $sum: 1 }, avg: { $avg: "$overall_average" } } },
        { $sort: { count: -1 } },
      ]),

      // Ratings breakdown buckets: 1-4, 5-6, 7-8, 9-10
      ServiceReview.aggregate([
        {
          $group: {
            _id: null,
            needs_work: {
              $sum: { $cond: [{ $lte: ["$overall_average", 4] }, 1, 0] },
            },
            fair: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ["$overall_average", 5] }, { $lte: ["$overall_average", 6] }] },
                  1,
                  0,
                ],
              },
            },
            good: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ["$overall_average", 7] }, { $lte: ["$overall_average", 8] }] },
                  1,
                  0,
                ],
              },
            },
            excellent: {
              $sum: { $cond: [{ $gte: ["$overall_average", 9] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const total = totals[0]?.total || 0;
    const avg_rating = totals[0]?.avg_rating
      ? Math.round(totals[0].avg_rating * 10) / 10
      : 0;

    res.json({
      total_submissions: total,
      average_rating: avg_rating,
      recent_submissions: recentList,
      by_service_type: byType,
      ratings_breakdown: ratingBreakdown[0] || {
        needs_work: 0,
        fair: 0,
        good: 0,
        excellent: 0,
      },
    });
  } catch (err) {
    console.error("[ServiceReviews] Stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch statistics." });
  }
});

// ─── GET /service-reviews/export  (leader/CMS — full CSV export) ────────────
router.get("/export", requireLeaderOrCMS, async (req, res) => {
  try {
    const { service_type, date_from, date_to } = req.query;

    const query = {};
    if (service_type && service_type !== "all") query.service_type = service_type;
    if (date_from || date_to) {
      query.service_date = {};
      if (date_from) query.service_date.$gte = new Date(date_from);
      if (date_to) {
        const to = new Date(date_to);
        to.setHours(23, 59, 59, 999);
        query.service_date.$lte = to;
      }
    }

    const reviews = await ServiceReview.find(query).sort({ createdAt: -1 }).lean();

    const headers = [
      "Submitted At",
      "Full Name",
      "Role",
      "Service Date",
      "Service Type",
      "Worship Team Leading",
      "Sound & Audio Quality",
      "Song Selection",
      "Welcoming Atmosphere",
      "Usher Seating & Order",
      "Offering & Transitions",
      "Children/Youth Engagement",
      "Children Area Safety",
      "Materials & Teachers",
      "Projection & Displays",
      "Livestream Quality",
      "Media Transitions",
      "Service Start Time",
      "Time Management",
      "Teams Ready",
      "Overall Average",
      "Highlight",
      "Improvement Suggestions",
    ];

    const escape = (val) => {
      const str = val === null || val === undefined ? "" : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const serviceTypeLabel = (t) => {
      const map = {
        sunday_service: "Sunday Service",
        midweek: "Midweek Service",
        special: "Special Service",
      };
      return map[t] || t;
    };

    const rows = reviews.map((r) =>
      [
        new Date(r.createdAt).toLocaleString("en-US"),
        r.full_name,
        r.role,
        new Date(r.service_date).toLocaleDateString("en-US"),
        serviceTypeLabel(r.service_type),
        r.worship_team_leading,
        r.sound_audio_quality,
        r.song_selection,
        r.welcoming_atmosphere,
        r.usher_seating_order,
        r.offering_transitions,
        r.children_youth_engagement,
        r.children_area_safety,
        r.materials_teachers_prepared,
        r.projection_displays,
        r.livestream_quality,
        r.media_transitions,
        r.service_start_time,
        r.overall_time_management,
        r.teams_ready_before_service,
        r.overall_average,
        r.highlight,
        r.improvement_suggestions,
      ]
        .map(escape)
        .join(",")
    );

    const csv = [headers.map(escape).join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="service-reviews-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error("[ServiceReviews] Export error:", err.message);
    res.status(500).json({ error: "Export failed." });
  }
});

// ─── GET /service-reviews/:id  (leader/CMS — single review detail) ─────────
router.get("/:id", requireLeaderOrCMS, async (req, res) => {
  try {
    const review = await ServiceReview.findById(req.params.id).lean();
    if (!review) return res.status(404).json({ error: "Review not found." });
    res.json(review);
  } catch (err) {
    console.error("[ServiceReviews] GET/:id error:", err.message);
    res.status(500).json({ error: "Failed to fetch review." });
  }
});

// ─── DELETE /service-reviews/:id  (CMS only) ─────────────────────────────────
router.delete("/:id", requireLeaderOrCMS, async (req, res) => {
  try {
    if (req.user.role !== "cms") {
      return res.status(403).json({ error: "Only CMS administrators can delete reviews." });
    }
    const review = await ServiceReview.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found." });
    res.json({ deleted: true });
  } catch (err) {
    console.error("[ServiceReviews] DELETE error:", err.message);
    res.status(500).json({ error: "Failed to delete review." });
  }
});

module.exports = router;
