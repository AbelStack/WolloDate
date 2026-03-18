<?php

namespace App\Console\Commands;

use App\Models\Story;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class CleanupExpiredStories extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'stories:cleanup';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Delete expired stories and their media files';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info('Starting expired stories cleanup...');

        $expiredStories = Story::expired()->get();
        $count = $expiredStories->count();

        if ($count === 0) {
            $this->info('No expired stories found.');
            return Command::SUCCESS;
        }

        $deletedMedia = 0;
        $deletedRecords = 0;

        foreach ($expiredStories as $story) {
            // Delete media file
            if ($story->media_path && Storage::disk('local')->exists($story->media_path)) {
                Storage::disk('local')->delete($story->media_path);
                $deletedMedia++;
            }

            // Delete the story record (cascade deletes views)
            $story->delete();
            $deletedRecords++;
        }

        $this->info("Cleaned up {$deletedRecords} expired stories and {$deletedMedia} media files.");

        return Command::SUCCESS;
    }
}
