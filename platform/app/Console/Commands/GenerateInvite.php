<?php

namespace App\Console\Commands;

use App\Models\Invite;
use Illuminate\Console\Command;

class GenerateInvite extends Command
{
    protected $signature = 'invite:generate {--email= : Restrict to email} {--count=1 : Number of codes}';
    protected $description = 'Generate an invite code';

    public function handle()
    {
        $count = (int) $this->option('count');
        $email = $this->option('email');

        for ($i = 0; $i < $count; $i++) {
            $invite = Invite::create([
                'code' => Invite::generateCode(),
                'email' => $email,
            ]);

            $this->info("Generated: {$invite->code}");
        }
    }
}
