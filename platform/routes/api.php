<?php

use App\Http\Controllers\Api\ApiCredentialController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Internal\ProjectFeedController;
use Illuminate\Support\Facades\Route;

// ---------------------------------------------------------------- console (session or bearer auth)

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);

    Route::get('/organizations', [OrganizationController::class, 'index']);
    Route::get('/organizations/{organization}', [OrganizationController::class, 'show']);
    Route::get('/organizations/{organization}/members', [OrganizationController::class, 'members']);
    Route::post('/organizations/{organization}/members', [OrganizationController::class, 'addMember']);
    Route::delete('/organizations/{organization}/members/{member}', [OrganizationController::class, 'removeMember']);

    Route::get('/organizations/{organization}/api-credentials', [ApiCredentialController::class, 'index']);
    Route::post('/organizations/{organization}/api-credentials', [ApiCredentialController::class, 'store']);
    Route::delete('/organizations/{organization}/api-credentials/{credential}', [ApiCredentialController::class, 'destroy']);

    Route::get('/organizations/{organization}/projects', [ProjectController::class, 'index']);
    Route::post('/organizations/{organization}/projects', [ProjectController::class, 'store']);
    Route::get('/organizations/{organization}/projects/{project}', [ProjectController::class, 'show']);
    Route::patch('/organizations/{organization}/projects/{project}', [ProjectController::class, 'update']);
    Route::delete('/organizations/{organization}/projects/{project}', [ProjectController::class, 'destroy']);
    Route::post('/organizations/{organization}/projects/{project}/rotate-certificate', [ProjectController::class, 'rotateCertificate']);
    Route::delete('/organizations/{organization}/projects/{project}/secondary-certificate', [ProjectController::class, 'dropSecondaryCertificate']);
    Route::get('/organizations/{organization}/projects/{project}/usage', [ProjectController::class, 'usage']);
    Route::get('/organizations/{organization}/projects/{project}/live', [ProjectController::class, 'live']);

    Route::get('/organizations/{organization}/projects/{project}/webhooks', [WebhookController::class, 'index']);
    Route::post('/organizations/{organization}/projects/{project}/webhooks', [WebhookController::class, 'store']);
    Route::patch('/organizations/{organization}/projects/{project}/webhooks/{webhook}', [WebhookController::class, 'update']);
    Route::delete('/organizations/{organization}/projects/{project}/webhooks/{webhook}', [WebhookController::class, 'destroy']);
    Route::get('/organizations/{organization}/projects/{project}/webhooks/{webhook}/deliveries', [WebhookController::class, 'deliveries']);
});

// ---------------------------------------------------------------- internal (cluster secret)

Route::middleware('cluster.secret')->prefix('internal')->group(function () {
    Route::get('/projects', [ProjectFeedController::class, 'index']);
    Route::post('/events', [\App\Http\Controllers\Internal\EventIngestController::class, 'store']);
});

// ---------------------------------------------------------------- REST API v1
Route::middleware(['api.credential', 'throttle:60,1'])->prefix('v1')->group(function () {
    Route::get('/channels', [\App\Http\Controllers\Api\V1\ChannelController::class, 'index']);
    Route::get('/channels/{channel}/users', [\App\Http\Controllers\Api\V1\ChannelController::class, 'users']);
    Route::post('/channels/{channel}/kick', [\App\Http\Controllers\Api\V1\ChannelController::class, 'kick']);
    Route::post('/channels/{channel}/ban', [\App\Http\Controllers\Api\V1\ChannelController::class, 'ban']);
    Route::post('/channels/{channel}/mute', [\App\Http\Controllers\Api\V1\ChannelController::class, 'mute']);
    Route::post('/channels/{channel}/end', [\App\Http\Controllers\Api\V1\ChannelController::class, 'end']);
});

// ---------------------------------------------------------------- admin
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsureAdmin::class])->prefix('admin')->group(function () {
    Route::get('/organizations', [\App\Http\Controllers\Admin\AdminController::class, 'organizations']);
    Route::get('/organizations/{organization}', [\App\Http\Controllers\Admin\AdminController::class, 'organizationShow']);
    Route::patch('/organizations/{organization}', [\App\Http\Controllers\Admin\AdminController::class, 'organizationUpdate']);
    
    Route::get('/projects', [\App\Http\Controllers\Admin\AdminController::class, 'projects']);
    Route::patch('/projects/{project}', [\App\Http\Controllers\Admin\AdminController::class, 'projectUpdate']);
    
    Route::get('/stats', [\App\Http\Controllers\Admin\AdminController::class, 'stats']);
});
