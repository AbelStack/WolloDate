<?php

namespace App\Http\Controllers;

use App\Models\Report;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    /**
     * Submit a report (user action)
     * POST /api/reports
     */
    public function store(Request $request)
    {
        $request->validate([
            'reportable_type' => 'required|in:post,comment,story,user',
            'reportable_id' => 'required|integer',
            'reason' => 'required|in:spam,harassment,inappropriate_content,hate_speech,violence,fake_account,other',
            'description' => 'nullable|string|max:1000',
        ]);

        $typeMap = [
            'post' => 'App\\Models\\Post',
            'comment' => 'App\\Models\\Comment',
            'story' => 'App\\Models\\Story',
            'user' => 'App\\Models\\User',
        ];

        $reportableType = $typeMap[$request->reportable_type];
        
        // Check if the reportable exists
        $model = $reportableType::find($request->reportable_id);
        if (!$model) {
            return response()->json(['message' => 'Content not found'], 404);
        }

        // Check for duplicate reports
        $existingReport = Report::where('reporter_id', $request->user()->id)
            ->where('reportable_type', $reportableType)
            ->where('reportable_id', $request->reportable_id)
            ->where('status', 'pending')
            ->first();

        if ($existingReport) {
            return response()->json(['message' => 'You have already reported this content'], 400);
        }

        $report = Report::create([
            'reporter_id' => $request->user()->id,
            'reportable_type' => $reportableType,
            'reportable_id' => $request->reportable_id,
            'reason' => $request->reason,
            'description' => $request->description,
        ]);

        return response()->json([
            'message' => 'Report submitted successfully. Our team will review it shortly.',
            'report_id' => $report->id,
        ], 201);
    }
}
