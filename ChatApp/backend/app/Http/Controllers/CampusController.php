<?php

namespace App\Http\Controllers;

use App\Models\Campus;
use Illuminate\Http\Response;

class CampusController extends Controller
{
    public function index()
    {
        $campuses = Campus::with('departments')->get();
        return response()->json($campuses, Response::HTTP_OK);
    }
}
