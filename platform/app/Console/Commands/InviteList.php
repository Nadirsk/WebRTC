<?php

namespace App\Console\Commands;

use App\Models\Invite;
use Illuminate\Console\Command;

class InviteList extends Command
{
    protected $signature = 'invite:list';
    protected $description = 'List unused invite codes';

    public function handle()
    {
        $invites = Invite::whereNull('used_at')
            ->where(function($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->get(['code', 'email', 'expires_at']);

        $this->table(['Code', 'Email', 'Expires At'], $invites->toArray());
    }
}
