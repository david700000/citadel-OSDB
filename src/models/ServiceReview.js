// src/models/ServiceReview.js
const mongoose = require("mongoose");

const ratingField = {
  type: Number,
  min: 1,
  max: 10,
  required: true,
};

const ServiceReviewSchema = new mongoose.Schema(
  {
    // ── Submitter Details ────────────────────────────────────────────────────
    full_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    role: {
      type: String,
      required: true,
      enum: ["worker", "member", "visitor", "leader", "pastor"],
    },
    service_date: {
      type: Date,
      required: true,
    },
    service_type: {
      type: String,
      required: true,
      enum: ["sunday_service", "midweek", "special"],
    },

    // ── Worship & Sound Quality (3 ratings) ─────────────────────────────────
    worship_team_leading: ratingField,
    sound_audio_quality: ratingField,
    song_selection: ratingField,

    // ── Ushering & Atmosphere (3 ratings) ────────────────────────────────────
    welcoming_atmosphere: ratingField,
    usher_seating_order: ratingField,
    offering_transitions: ratingField,

    // ── Children & Youth (3 ratings) ─────────────────────────────────────────
    children_youth_engagement: ratingField,
    children_area_safety: ratingField,
    materials_teachers_prepared: ratingField,

    // ── Media & Livestream (3 ratings) ───────────────────────────────────────
    projection_displays: ratingField,
    livestream_quality: ratingField,
    media_transitions: ratingField,

    // ── Punctuality & Time Management (3 ratings) ────────────────────────────
    service_start_time: ratingField,
    overall_time_management: ratingField,
    teams_ready_before_service: ratingField,

    // ── Additional Comments ──────────────────────────────────────────────────
    highlight: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    improvement_suggestions: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // ── Computed ─────────────────────────────────────────────────────────────
    overall_average: {
      type: Number,
    },
  },
  { timestamps: true }
);

// Compute overall_average before saving
ServiceReviewSchema.pre("save", async function () {
  const ratings = [
    this.worship_team_leading,
    this.sound_audio_quality,
    this.song_selection,
    this.welcoming_atmosphere,
    this.usher_seating_order,
    this.offering_transitions,
    this.children_youth_engagement,
    this.children_area_safety,
    this.materials_teachers_prepared,
    this.projection_displays,
    this.livestream_quality,
    this.media_transitions,
    this.service_start_time,
    this.overall_time_management,
    this.teams_ready_before_service,
  ];
  const sum = ratings.reduce((a, b) => a + b, 0);
  this.overall_average = Math.round((sum / ratings.length) * 10) / 10;
});

module.exports = mongoose.model("ServiceReview", ServiceReviewSchema);
