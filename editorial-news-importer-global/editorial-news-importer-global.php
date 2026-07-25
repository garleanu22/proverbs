<?php
/**
 * Plugin Name: Editorial News Importer Global
 * Description: Importator RSS global fără AI, cu surse active, import direct în Articole, protecție anti-duplicat, circuit breaker, control editorial și SEO tehnic.
 * Version: 3.3.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: Editorial News
 * Text Domain: editorial-news-importer-global
 */

defined('ABSPATH') || exit;

define('EANI_GLOBAL_VERSION', '3.3.0');
define('EANI_GLOBAL_DB_VERSION', '3.3.0');
define('EANI_GLOBAL_FILE', __FILE__);
define('EANI_GLOBAL_DIR', plugin_dir_path(__FILE__));

final class EANI_Global_Importer_330 {
    const OPTION_SETTINGS = 'eani_global_settings';
    const OPTION_DB_VERSION = 'eani_global_db_version';
    const OPTION_CURSOR = 'eani_global_source_cursor';
    const OPTION_LAST_RUN = 'eani_global_last_run';
    const CRON_HOOK = 'eani_global_import_tick';
    const CRON_SCHEDULE = 'eani_global_five_minutes';
    const LOCK_KEY = 'eani_global_import_lock';

    public static function boot() {
        add_action('plugins_loaded', [__CLASS__, 'maybe_upgrade']);
        add_filter('cron_schedules', [__CLASS__, 'cron_schedules']);
        add_action(self::CRON_HOOK, [__CLASS__, 'process_tick']);

        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'admin_assets']);
        add_action('admin_notices', [__CLASS__, 'admin_notices']);

        add_action('admin_post_eani_global_import_now', [__CLASS__, 'handle_import_now']);
        add_action('admin_post_eani_global_sync_catalog', [__CLASS__, 'handle_sync_catalog']);
        add_action('admin_post_eani_global_activate_all', [__CLASS__, 'handle_activate_all']);
        add_action('admin_post_eani_global_deactivate_all', [__CLASS__, 'handle_deactivate_all']);
        add_action('admin_post_eani_global_toggle_source', [__CLASS__, 'handle_toggle_source']);
        add_action('admin_post_eani_global_test_source', [__CLASS__, 'handle_test_source']);
        add_action('admin_post_eani_global_save_settings', [__CLASS__, 'handle_save_settings']);

        add_action('add_meta_boxes', [__CLASS__, 'add_meta_box']);
        add_action('save_post_post', [__CLASS__, 'save_meta_box'], 10, 2);
        add_filter('wp_robots', [__CLASS__, 'filter_robots']);
        add_action('wp_head', [__CLASS__, 'output_frontend_seo'], 20);
        add_filter('the_content', [__CLASS__, 'append_source_box']);

        add_action('init', [__CLASS__, 'add_rewrite_rules']);
        add_filter('query_vars', [__CLASS__, 'query_vars']);
        add_action('template_redirect', [__CLASS__, 'maybe_render_news_sitemap']);
        add_filter('robots_txt', [__CLASS__, 'robots_txt'], 10, 2);
    }

    public static function activate() {
        self::install_tables();
        self::migrate_legacy_columns();
        self::sync_catalog(false, false);
        self::ensure_cron();
        self::add_rewrite_rules();
        flush_rewrite_rules(false);
        update_option(self::OPTION_DB_VERSION, EANI_GLOBAL_DB_VERSION, false);
    }

    public static function deactivate() {
        $timestamp = wp_next_scheduled(self::CRON_HOOK);
        while ($timestamp) {
            wp_unschedule_event($timestamp, self::CRON_HOOK);
            $timestamp = wp_next_scheduled(self::CRON_HOOK);
        }
        delete_transient(self::LOCK_KEY);
    }

    public static function maybe_upgrade() {
        if (get_option(self::OPTION_DB_VERSION) !== EANI_GLOBAL_DB_VERSION) {
            self::install_tables();
            self::migrate_legacy_columns();
            self::sync_catalog(false, false);
            update_option(self::OPTION_DB_VERSION, EANI_GLOBAL_DB_VERSION, false);
        }
        self::ensure_cron();
    }

    private static function sources_table() {
        global $wpdb;
        return $wpdb->prefix . 'eani_sources';
    }

    private static function items_table() {
        global $wpdb;
        return $wpdb->prefix . 'eani_imported_items';
    }

    public static function install_tables() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        $sources = self::sources_table();
        $items = self::items_table();

        $sql_sources = "CREATE TABLE {$sources} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            source_key varchar(191) NOT NULL DEFAULT '',
            name varchar(255) NOT NULL DEFAULT '',
            feed_url text NOT NULL,
            feed_hash char(64) NOT NULL DEFAULT '',
            site_url text NOT NULL,
            region varchar(80) NOT NULL DEFAULT 'Global',
            country varchar(120) NOT NULL DEFAULT '',
            language varchar(12) NOT NULL DEFAULT 'en',
            source_type varchar(40) NOT NULL DEFAULT 'publisher',
            legal_mode varchar(40) NOT NULL DEFAULT 'headline_link',
            content_mode varchar(32) NOT NULL DEFAULT 'title_link',
            category_id bigint(20) unsigned NOT NULL DEFAULT 0,
            active tinyint(1) NOT NULL DEFAULT 1,
            max_items smallint(5) unsigned NOT NULL DEFAULT 1,
            fail_count smallint(5) unsigned NOT NULL DEFAULT 0,
            pause_until datetime NULL,
            last_checked datetime NULL,
            last_success datetime NULL,
            last_status varchar(32) NOT NULL DEFAULT 'untested',
            last_http smallint(5) unsigned NOT NULL DEFAULT 0,
            last_error text NULL,
            discovered tinyint(1) NOT NULL DEFAULT 0,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            KEY source_key (source_key),
            KEY feed_hash (feed_hash),
            KEY active_pause (active,pause_until),
            KEY region (region)
        ) {$charset};";

        $sql_items = "CREATE TABLE {$items} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            source_id bigint(20) unsigned NOT NULL DEFAULT 0,
            item_hash char(64) NOT NULL,
            item_url text NOT NULL,
            post_id bigint(20) unsigned NOT NULL DEFAULT 0,
            item_published datetime NULL,
            imported_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY item_hash (item_hash),
            KEY source_id (source_id),
            KEY post_id (post_id),
            KEY imported_at (imported_at)
        ) {$charset};";

        dbDelta($sql_sources);
        dbDelta($sql_items);
    }

    private static function table_columns($table) {
        global $wpdb;
        $rows = $wpdb->get_results("SHOW COLUMNS FROM {$table}", ARRAY_A);
        $columns = [];
        foreach ((array) $rows as $row) {
            if (!empty($row['Field'])) {
                $columns[$row['Field']] = true;
            }
        }
        return $columns;
    }

    public static function migrate_legacy_columns() {
        global $wpdb;
        $table = self::sources_table();
        $columns = self::table_columns($table);
        if (!$columns) {
            return;
        }
        if (isset($columns['url'], $columns['feed_url'])) {
            $wpdb->query("UPDATE {$table} SET feed_url = url WHERE (feed_url = '' OR feed_url IS NULL) AND url <> ''");
        }
        if (isset($columns['rss_url'], $columns['feed_url'])) {
            $wpdb->query("UPDATE {$table} SET feed_url = rss_url WHERE (feed_url = '' OR feed_url IS NULL) AND rss_url <> ''");
        }
        if (isset($columns['enabled'], $columns['active'])) {
            $wpdb->query("UPDATE {$table} SET active = enabled WHERE active IS NULL");
        }
        $wpdb->query("UPDATE {$table} SET feed_hash = SHA2(LOWER(TRIM(feed_url)), 256) WHERE feed_url <> '' AND (feed_hash = '' OR feed_hash IS NULL)");
    }

    private static function catalog() {
        $file = EANI_GLOBAL_DIR . 'includes/catalog.php';
        $catalog = file_exists($file) ? include $file : [];
        return is_array($catalog) ? $catalog : [];
    }

    private static function catalog_row($row) {
        $keys = ['source_key','name','feed_url','site_url','region','country','language','source_type','legal_mode','content_mode','active','max_items'];
        $data = [];
        foreach ($keys as $index => $key) {
            $data[$key] = isset($row[$index]) ? $row[$index] : '';
        }
        $data['active'] = (int) $data['active'];
        $data['max_items'] = max(1, min(10, (int) $data['max_items']));
        $data['feed_hash'] = $data['feed_url'] ? hash('sha256', strtolower(trim($data['feed_url']))) : '';
        return $data;
    }

    public static function sync_catalog($force_active = false, $show_notice = true) {
        global $wpdb;
        $table = self::sources_table();
        $created = 0;
        $updated = 0;
        $linked = 0;
        $now = current_time('mysql', true);

        foreach (self::catalog() as $raw) {
            $source = self::catalog_row($raw);
            $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE source_key = %s ORDER BY id ASC LIMIT 1", $source['source_key']), ARRAY_A);
            if (!$existing && $source['feed_url']) {
                $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE feed_hash = %s OR feed_url = %s ORDER BY id ASC LIMIT 1", $source['feed_hash'], $source['feed_url']), ARRAY_A);
                if ($existing) {
                    $linked++;
                }
            }

            if ($existing) {
                $update = [
                    'source_key' => $source['source_key'],
                    'name' => $source['name'],
                    'site_url' => $source['site_url'],
                    'region' => $source['region'],
                    'country' => $source['country'],
                    'language' => $source['language'],
                    'source_type' => $source['source_type'],
                    'legal_mode' => $source['legal_mode'],
                    'content_mode' => $source['content_mode'],
                    'max_items' => $source['max_items'],
                    'updated_at' => $now,
                ];
                if (empty($existing['feed_url']) && $source['feed_url']) {
                    $update['feed_url'] = $source['feed_url'];
                    $update['feed_hash'] = $source['feed_hash'];
                }
                if ($force_active && $source['feed_url']) {
                    $update['active'] = 1;
                    $update['pause_until'] = null;
                }
                $wpdb->update($table, $update, ['id' => (int) $existing['id']]);
                $updated++;
            } else {
                $insert = $source;
                $insert['category_id'] = 0;
                $insert['fail_count'] = 0;
                $insert['last_status'] = 'untested';
                $insert['last_http'] = 0;
                $insert['discovered'] = 0;
                $insert['created_at'] = $now;
                $insert['updated_at'] = $now;
                $wpdb->insert($table, $insert);
                if ($wpdb->insert_id) {
                    $created++;
                }
            }
        }

        if ($show_notice) {
            return compact('created', 'updated', 'linked');
        }
        return compact('created', 'updated', 'linked');
    }

    public static function cron_schedules($schedules) {
        $schedules[self::CRON_SCHEDULE] = [
            'interval' => 300,
            'display' => __('La fiecare 5 minute', 'editorial-news-importer-global'),
        ];
        return $schedules;
    }

    private static function ensure_cron() {
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + 60, self::CRON_SCHEDULE, self::CRON_HOOK);
        }
    }

    private static function settings() {
        $defaults = [
            'post_status' => 'draft',
            'batch_size' => 16,
            'max_items_per_source' => 1,
            'excerpt_words' => 90,
            'pause_failures' => 3,
            'pause_hours' => 12,
            'default_category_id' => 0,
            'append_source_box' => 1,
            'nofollow_source' => 1,
        ];
        $saved = get_option(self::OPTION_SETTINGS, []);
        return wp_parse_args(is_array($saved) ? $saved : [], $defaults);
    }

    public static function feed_cache_lifetime() {
        return 300;
    }

    public static function process_tick($manual = false) {
        if (get_transient(self::LOCK_KEY)) {
            return ['processed' => 0, 'created' => 0, 'locked' => true];
        }
        set_transient(self::LOCK_KEY, 1, 4 * MINUTE_IN_SECONDS);
        $result = ['processed' => 0, 'created' => 0, 'errors' => 0, 'locked' => false];

        try {
            $settings = self::settings();
            $sources = self::next_sources((int) $settings['batch_size']);
            foreach ($sources as $source) {
                $one = self::process_source($source);
                $result['processed']++;
                $result['created'] += isset($one['created']) ? (int) $one['created'] : 0;
                if (empty($one['ok'])) {
                    $result['errors']++;
                }
            }
            update_option(self::OPTION_LAST_RUN, [
                'time' => current_time('mysql', true),
                'result' => $result,
                'manual' => (bool) $manual,
            ], false);
        } finally {
            delete_transient(self::LOCK_KEY);
        }
        return $result;
    }

    private static function next_sources($limit) {
        global $wpdb;
        $table = self::sources_table();
        $limit = max(1, min(50, $limit));
        $cursor = (int) get_option(self::OPTION_CURSOR, 0);
        $now = current_time('mysql', true);

        $first = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} WHERE active = 1 AND feed_url <> '' AND (pause_until IS NULL OR pause_until <= %s) AND id > %d ORDER BY id ASC LIMIT %d",
            $now,
            $cursor,
            $limit
        ), ARRAY_A);
        $rows = (array) $first;
        $remaining = $limit - count($rows);
        if ($remaining > 0) {
            $wrap = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$table} WHERE active = 1 AND feed_url <> '' AND (pause_until IS NULL OR pause_until <= %s) AND id <= %d ORDER BY id ASC LIMIT %d",
                $now,
                $cursor,
                $remaining
            ), ARRAY_A);
            $rows = array_merge($rows, (array) $wrap);
        }
        if ($rows) {
            $last = end($rows);
            update_option(self::OPTION_CURSOR, (int) $last['id'], false);
        } else {
            update_option(self::OPTION_CURSOR, 0, false);
        }
        return $rows;
    }

    private static function process_source($source) {
        global $wpdb;
        $table = self::sources_table();
        $settings = self::settings();
        $feed_url = trim((string) $source['feed_url']);

        add_filter('wp_feed_cache_transient_lifetime', [__CLASS__, 'feed_cache_lifetime']);
        require_once ABSPATH . WPINC . '/feed.php';
        $feed = fetch_feed($feed_url);
        remove_filter('wp_feed_cache_transient_lifetime', [__CLASS__, 'feed_cache_lifetime']);

        if (is_wp_error($feed)) {
            self::record_source_failure($source, $feed->get_error_message());
            return ['ok' => false, 'created' => 0, 'error' => $feed->get_error_message()];
        }

        $available = (int) $feed->get_item_quantity(20);
        $items = $feed->get_items(0, min(20, max(5, $available)));
        $limit = min(
            max(1, (int) $source['max_items']),
            max(1, (int) $settings['max_items_per_source'])
        );
        $created = 0;
        $seen = 0;
        foreach ((array) $items as $item) {
            if ($created >= $limit || $seen >= 20) {
                break;
            }
            $seen++;
            $post_id = self::import_item($source, $item);
            if ($post_id > 0) {
                $created++;
            }
        }

        $wpdb->update($table, [
            'fail_count' => 0,
            'pause_until' => null,
            'last_checked' => current_time('mysql', true),
            'last_success' => current_time('mysql', true),
            'last_status' => 'verified',
            'last_error' => '',
            'updated_at' => current_time('mysql', true),
        ], ['id' => (int) $source['id']]);

        return ['ok' => true, 'created' => $created, 'available' => $available];
    }

    private static function record_source_failure($source, $message) {
        global $wpdb;
        $settings = self::settings();
        $table = self::sources_table();
        $fails = (int) $source['fail_count'] + 1;
        $pause_until = null;
        $status = 'failed';
        if ($fails >= max(1, (int) $settings['pause_failures'])) {
            $pause_until = gmdate('Y-m-d H:i:s', time() + max(1, (int) $settings['pause_hours']) * HOUR_IN_SECONDS);
            $status = 'paused';
        }
        $wpdb->update($table, [
            'fail_count' => $fails,
            'pause_until' => $pause_until,
            'last_checked' => current_time('mysql', true),
            'last_status' => $status,
            'last_error' => wp_strip_all_tags((string) $message),
            'updated_at' => current_time('mysql', true),
        ], ['id' => (int) $source['id']]);
    }

    private static function import_item($source, $item) {
        global $wpdb;
        $items_table = self::items_table();
        $title = trim(wp_strip_all_tags((string) $item->get_title()));
        $url = self::canonical_item_url((string) $item->get_permalink());
        $guid = trim((string) $item->get_id());
        if (!$title || (!$url && !$guid)) {
            return 0;
        }
        $identity = $url ? $url : $guid;
        $hash = hash('sha256', strtolower(trim($identity)));
        $exists = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM {$items_table} WHERE item_hash = %s LIMIT 1", $hash));
        if ($exists) {
            return 0;
        }

        $settings = self::settings();
        $raw_description = (string) $item->get_description();
        if (!$raw_description) {
            $raw_description = (string) $item->get_content();
        }
        $plain = html_entity_decode(wp_strip_all_tags(strip_shortcodes($raw_description)), ENT_QUOTES, get_bloginfo('charset'));
        $plain = preg_replace('/\s+/u', ' ', trim($plain));
        $excerpt = wp_trim_words($plain, max(30, (int) $settings['excerpt_words']), '…');
        $mode = isset($source['content_mode']) ? $source['content_mode'] : 'title_link';

        $parts = [];
        if ($mode === 'summary_link' && $excerpt) {
            $parts[] = '<p>' . esc_html($excerpt) . '</p>';
        }
        if ($url) {
            $rel = !empty($settings['nofollow_source']) ? 'noopener nofollow external' : 'noopener external';
            $parts[] = '<p class="eani-source-reference"><strong>' . esc_html__('Sursa:', 'editorial-news-importer-global') . '</strong> <a href="' . esc_url($url) . '" rel="' . esc_attr($rel) . '" target="_blank">' . esc_html($source['name']) . '</a></p>';
        }
        $content = implode("\n", $parts);
        $category_id = self::source_category_id($source);

        $postarr = [
            'post_type' => 'post',
            'post_status' => in_array($settings['post_status'], ['draft','pending','publish'], true) ? $settings['post_status'] : 'draft',
            'post_title' => $title,
            'post_content' => $content,
            'post_excerpt' => $excerpt,
            'post_category' => $category_id ? [$category_id] : [],
            'meta_input' => [
                '_eani_imported' => '1',
                '_eani_source_id' => (int) $source['id'],
                '_eani_source_name' => sanitize_text_field($source['name']),
                '_eani_source_url' => esc_url_raw($url),
                '_eani_source_feed' => esc_url_raw($source['feed_url']),
                '_eani_source_region' => sanitize_text_field($source['region']),
                '_eani_source_country' => sanitize_text_field($source['country']),
                '_eani_source_language' => sanitize_key($source['language']),
                '_eani_item_hash' => $hash,
                '_eani_editorial_approved' => '0',
                '_eani_meta_description' => sanitize_text_field(wp_trim_words($excerpt, 28, '…')),
            ],
        ];

        $date = $item->get_date('Y-m-d H:i:s');
        if ($date && strtotime($date) > strtotime('-45 days') && strtotime($date) <= time() + HOUR_IN_SECONDS) {
            $postarr['post_date_gmt'] = get_gmt_from_date($date);
            $postarr['post_date'] = get_date_from_gmt($postarr['post_date_gmt']);
        }

        $post_id = wp_insert_post(wp_slash($postarr), true);
        if (is_wp_error($post_id)) {
            return 0;
        }

        $tags = array_filter(array_unique([
            sanitize_text_field($source['name']),
            sanitize_text_field($source['country']),
        ]));
        if ($tags) {
            wp_set_post_tags($post_id, $tags, false);
        }

        $published = $item->get_date('Y-m-d H:i:s');
        $wpdb->insert($items_table, [
            'source_id' => (int) $source['id'],
            'item_hash' => $hash,
            'item_url' => $url,
            'post_id' => (int) $post_id,
            'item_published' => $published ?: null,
            'imported_at' => current_time('mysql', true),
        ]);
        return (int) $post_id;
    }

    private static function canonical_item_url($url) {
        $url = trim($url);
        if (!$url) {
            return '';
        }
        $parts = wp_parse_url($url);
        if (!$parts || empty($parts['host'])) {
            return esc_url_raw($url);
        }
        $scheme = !empty($parts['scheme']) ? strtolower($parts['scheme']) : 'https';
        $host = strtolower($parts['host']);
        $port = !empty($parts['port']) ? ':' . (int) $parts['port'] : '';
        $path = !empty($parts['path']) ? $parts['path'] : '/';
        $query = '';
        if (!empty($parts['query'])) {
            parse_str($parts['query'], $params);
            foreach (array_keys($params) as $key) {
                if (preg_match('/^(utm_|fbclid$|gclid$|dclid$|msclkid$|mc_cid$|mc_eid$)/i', (string) $key)) {
                    unset($params[$key]);
                }
            }
            if ($params) {
                ksort($params);
                $query = '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
            }
        }
        return esc_url_raw($scheme . '://' . $host . $port . $path . $query);
    }

    private static function source_category_id($source) {
        $configured = !empty($source['category_id']) ? (int) $source['category_id'] : 0;
        if ($configured && term_exists($configured, 'category')) {
            return $configured;
        }
        $settings = self::settings();
        if (!empty($settings['default_category_id']) && term_exists((int) $settings['default_category_id'], 'category')) {
            return (int) $settings['default_category_id'];
        }
        $map = [
            'Romania' => 'România',
            'Europe' => 'Europa',
            'North America' => 'America de Nord',
            'Latin America' => 'America Latină',
            'Africa' => 'Africa',
            'Middle East' => 'Orientul Mijlociu',
            'Asia' => 'Asia',
            'Oceania' => 'Oceania',
            'Global' => 'Internațional',
        ];
        $name = isset($map[$source['region']]) ? $map[$source['region']] : 'Internațional';
        $term = term_exists($name, 'category');
        if (!$term) {
            $term = wp_insert_term($name, 'category');
        }
        if (is_wp_error($term)) {
            return 0;
        }
        return is_array($term) ? (int) $term['term_id'] : (int) $term;
    }

    public static function admin_menu() {
        add_menu_page('Editorial News', 'Editorial News', 'manage_options', 'eani-global', [__CLASS__, 'render_dashboard'], 'dashicons-rss', 26);
        add_submenu_page('eani-global', 'Panou', 'Panou', 'manage_options', 'eani-global', [__CLASS__, 'render_dashboard']);
        add_submenu_page('eani-global', 'Surse RSS', 'Surse RSS', 'manage_options', 'eani-global-sources', [__CLASS__, 'render_sources']);
        add_submenu_page('eani-global', 'Catalog global', 'Catalog global', 'manage_options', 'eani-global-catalog', [__CLASS__, 'render_catalog']);
        add_submenu_page('eani-global', 'Setări', 'Setări', 'manage_options', 'eani-global-settings', [__CLASS__, 'render_settings']);
    }

    public static function admin_assets($hook) {
        if (strpos((string) $hook, 'eani-global') === false) {
            return;
        }
        wp_register_style('eani-global-admin', false, [], EANI_GLOBAL_VERSION);
        wp_enqueue_style('eani-global-admin');
        wp_add_inline_style('eani-global-admin', '.eani-wrap{max-width:1400px}.eani-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:18px 0}.eani-card{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:18px}.eani-value{font-size:30px;font-weight:700;line-height:1.1}.eani-muted{color:#646970}.eani-actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.eani-status{display:inline-block;padding:3px 8px;border-radius:999px;background:#f0f0f1}.eani-status.verified{background:#d7f4df;color:#165b2b}.eani-status.failed,.eani-status.paused{background:#fbeaea;color:#8a2424}.eani-table td{vertical-align:top}.eani-inline{display:inline}.eani-filter{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:14px 0}.eani-filter label{display:flex;flex-direction:column;gap:4px}.eani-warning{border-left:4px solid #dba617;padding:12px;background:#fff8e5}.eani-ok{border-left:4px solid #00a32a;padding:12px;background:#edfaef}');
    }

    public static function admin_notices() {
        if (!current_user_can('manage_options') || empty($_GET['eani_notice'])) {
            return;
        }
        $message = sanitize_text_field(wp_unslash($_GET['eani_notice']));
        echo '<div class="notice notice-success is-dismissible"><p>' . esc_html($message) . '</p></div>';
    }

    private static function admin_url_with_notice($page, $message) {
        return add_query_arg(['page' => $page, 'eani_notice' => $message], admin_url('admin.php'));
    }

    public static function handle_import_now() {
        self::require_admin_action('eani_global_import_now');
        $result = self::process_tick(true);
        $message = sprintf('Import terminat: %d surse procesate, %d articole create, %d erori.', $result['processed'], $result['created'], $result['errors']);
        wp_safe_redirect(self::admin_url_with_notice('eani-global', $message));
        exit;
    }

    public static function handle_sync_catalog() {
        self::require_admin_action('eani_global_sync_catalog');
        $result = self::sync_catalog(false, true);
        $message = sprintf('Catalog sincronizat: %d surse noi, %d actualizate, %d asociate fără duplicare.', $result['created'], $result['updated'], $result['linked']);
        wp_safe_redirect(self::admin_url_with_notice('eani-global-catalog', $message));
        exit;
    }

    public static function handle_activate_all() {
        self::require_admin_action('eani_global_activate_all');
        global $wpdb;
        $table = self::sources_table();
        $count = $wpdb->query("UPDATE {$table} SET active = 1, pause_until = NULL WHERE feed_url <> ''");
        wp_safe_redirect(self::admin_url_with_notice('eani-global-catalog', sprintf('%d surse configurate au fost activate.', (int) $count)));
        exit;
    }

    public static function handle_deactivate_all() {
        self::require_admin_action('eani_global_deactivate_all');
        global $wpdb;
        $table = self::sources_table();
        $count = $wpdb->query("UPDATE {$table} SET active = 0");
        wp_safe_redirect(self::admin_url_with_notice('eani-global-catalog', sprintf('%d surse au fost dezactivate.', (int) $count)));
        exit;
    }

    public static function handle_toggle_source() {
        $id = isset($_GET['id']) ? absint($_GET['id']) : 0;
        self::require_admin_action('eani_global_toggle_' . $id);
        global $wpdb;
        $table = self::sources_table();
        $active = (int) $wpdb->get_var($wpdb->prepare("SELECT active FROM {$table} WHERE id = %d", $id));
        $wpdb->update($table, ['active' => $active ? 0 : 1, 'pause_until' => null], ['id' => $id]);
        wp_safe_redirect(self::admin_url_with_notice('eani-global-sources', $active ? 'Sursa a fost dezactivată.' : 'Sursa a fost activată.'));
        exit;
    }

    public static function handle_test_source() {
        $id = isset($_POST['id']) ? absint($_POST['id']) : 0;
        self::require_admin_action('eani_global_test_' . $id);
        global $wpdb;
        $table = self::sources_table();
        $source = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $id), ARRAY_A);
        if (!$source) {
            wp_die('Sursa nu există.');
        }
        $result = self::process_source_test($source);
        $message = $result['ok'] ? sprintf('Flux valid: %d elemente detectate.', $result['items']) : 'Flux invalid: ' . $result['error'];
        wp_safe_redirect(self::admin_url_with_notice('eani-global-sources', $message));
        exit;
    }

    private static function process_source_test($source) {
        global $wpdb;
        $table = self::sources_table();
        require_once ABSPATH . WPINC . '/feed.php';
        add_filter('wp_feed_cache_transient_lifetime', [__CLASS__, 'feed_cache_lifetime']);
        $feed = fetch_feed($source['feed_url']);
        remove_filter('wp_feed_cache_transient_lifetime', [__CLASS__, 'feed_cache_lifetime']);
        if (is_wp_error($feed)) {
            self::record_source_failure($source, $feed->get_error_message());
            return ['ok' => false, 'items' => 0, 'error' => $feed->get_error_message()];
        }
        $items = (int) $feed->get_item_quantity(20);
        $wpdb->update($table, [
            'fail_count' => 0,
            'pause_until' => null,
            'last_checked' => current_time('mysql', true),
            'last_success' => current_time('mysql', true),
            'last_status' => 'verified',
            'last_error' => '',
        ], ['id' => (int) $source['id']]);
        return ['ok' => true, 'items' => $items, 'error' => ''];
    }

    public static function handle_save_settings() {
        self::require_admin_action('eani_global_save_settings');
        $input = isset($_POST['settings']) ? (array) wp_unslash($_POST['settings']) : [];
        $settings = [
            'post_status' => in_array(isset($input['post_status']) ? $input['post_status'] : 'draft', ['draft','pending','publish'], true) ? $input['post_status'] : 'draft',
            'batch_size' => max(1, min(50, absint(isset($input['batch_size']) ? $input['batch_size'] : 16))),
            'max_items_per_source' => max(1, min(5, absint(isset($input['max_items_per_source']) ? $input['max_items_per_source'] : 1))),
            'excerpt_words' => max(30, min(250, absint(isset($input['excerpt_words']) ? $input['excerpt_words'] : 90))),
            'pause_failures' => max(1, min(10, absint(isset($input['pause_failures']) ? $input['pause_failures'] : 3))),
            'pause_hours' => max(1, min(168, absint(isset($input['pause_hours']) ? $input['pause_hours'] : 12))),
            'default_category_id' => absint(isset($input['default_category_id']) ? $input['default_category_id'] : 0),
            'append_source_box' => !empty($input['append_source_box']) ? 1 : 0,
            'nofollow_source' => !empty($input['nofollow_source']) ? 1 : 0,
        ];
        update_option(self::OPTION_SETTINGS, $settings, false);
        wp_safe_redirect(self::admin_url_with_notice('eani-global-settings', 'Setările au fost salvate.'));
        exit;
    }

    private static function require_admin_action($nonce_action) {
        if (!current_user_can('manage_options')) {
            wp_die('Acces interzis.');
        }
        check_admin_referer($nonce_action);
    }

    public static function render_dashboard() {
        global $wpdb;
        $table = self::sources_table();
        $items = self::items_table();
        $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
        $active = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} WHERE active = 1");
        $paused = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} WHERE active = 1 AND pause_until IS NOT NULL AND pause_until > UTC_TIMESTAMP()");
        $imported = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$items} WHERE imported_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)");
        $next = wp_next_scheduled(self::CRON_HOOK);
        $last = get_option(self::OPTION_LAST_RUN, []);
        echo '<div class="wrap eani-wrap"><h1>Editorial News Importer Global</h1>';
        echo '<p>Import direct în Articole, fără AI. Sursele sunt procesate în loturi, iar fluxurile instabile sunt suspendate temporar.</p>';
        echo '<div class="eani-grid">';
        self::metric_card('Surse totale', $total, 'Catalog și surse adăugate manual');
        self::metric_card('Surse active', $active, 'Procesate în sistem round-robin');
        self::metric_card('Suspendate temporar', $paused, 'Circuit breaker automat');
        self::metric_card('Articole / 24h', $imported, 'Create direct în WordPress');
        echo '</div><div class="eani-actions">';
        self::action_form('eani_global_import_now', 'eani_global_import_now', 'Importă acum', 'button button-primary');
        self::action_form('eani_global_sync_catalog', 'eani_global_sync_catalog', 'Sincronizează catalogul', 'button');
        echo '<a class="button" href="' . esc_url(admin_url('admin.php?page=eani-global-sources')) . '">Vezi sursele</a></div>';
        echo '<div class="eani-card"><h2>Starea automatizării</h2>';
        echo '<p><strong>Următoarea rulare:</strong> ' . esc_html($next ? wp_date('d.m.Y H:i:s', $next) : 'neprogramată') . '</p>';
        echo '<p><strong>Ultima rulare:</strong> ' . esc_html(!empty($last['time']) ? $last['time'] . ' UTC' : 'niciuna') . '</p>';
        if (!$next) {
            echo '<div class="eani-warning">WP-Cron nu este programat. Dezactivează și reactivează pluginul sau salvează din nou setările.</div>';
        } else {
            echo '<div class="eani-ok">Importul automat este programat la fiecare 5 minute.</div>';
        }
        echo '</div></div>';
    }

    private static function metric_card($label, $value, $detail) {
        echo '<div class="eani-card"><div class="eani-muted">' . esc_html($label) . '</div><div class="eani-value">' . esc_html($value) . '</div><div class="eani-muted">' . esc_html($detail) . '</div></div>';
    }

    private static function action_form($action, $nonce, $label, $class) {
        echo '<form class="eani-inline" method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr($action) . '">';
        wp_nonce_field($nonce);
        echo '<button class="' . esc_attr($class) . '" type="submit">' . esc_html($label) . '</button></form>';
    }

    public static function render_sources() {
        global $wpdb;
        $table = self::sources_table();
        $region = isset($_GET['region']) ? sanitize_text_field(wp_unslash($_GET['region'])) : '';
        $state = isset($_GET['state']) ? sanitize_key($_GET['state']) : '';
        $search = isset($_GET['s']) ? sanitize_text_field(wp_unslash($_GET['s'])) : '';
        $page_num = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
        $per_page = 80;
        $where = ['1=1'];
        $args = [];
        if ($region) {
            $where[] = 'region = %s';
            $args[] = $region;
        }
        if ($state === 'active') {
            $where[] = 'active = 1';
        } elseif ($state === 'inactive') {
            $where[] = 'active = 0';
        } elseif ($state === 'failed') {
            $where[] = "last_status IN ('failed','paused')";
        }
        if ($search) {
            $where[] = '(name LIKE %s OR country LIKE %s OR feed_url LIKE %s)';
            $like = '%' . $wpdb->esc_like($search) . '%';
            $args[] = $like;
            $args[] = $like;
            $args[] = $like;
        }
        $where_sql = implode(' AND ', $where);
        $count_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
        $total = (int) ($args ? $wpdb->get_var($wpdb->prepare($count_sql, $args)) : $wpdb->get_var($count_sql));
        $offset = ($page_num - 1) * $per_page;
        $query_args = array_merge($args, [$per_page, $offset]);
        $sql = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY active DESC, region ASC, name ASC LIMIT %d OFFSET %d";
        $rows = $wpdb->get_results($wpdb->prepare($sql, $query_args), ARRAY_A);
        $regions = $wpdb->get_col("SELECT DISTINCT region FROM {$table} ORDER BY region ASC");

        echo '<div class="wrap eani-wrap"><h1>Surse RSS</h1>';
        echo '<form class="eani-filter" method="get"><input type="hidden" name="page" value="eani-global-sources">';
        echo '<label>Căutare<input type="search" name="s" value="' . esc_attr($search) . '"></label>';
        echo '<label>Regiune<select name="region"><option value="">Toate</option>';
        foreach ($regions as $one_region) {
            echo '<option value="' . esc_attr($one_region) . '" ' . selected($region, $one_region, false) . '>' . esc_html($one_region) . '</option>';
        }
        echo '</select></label><label>Stare<select name="state"><option value="">Toate</option><option value="active" ' . selected($state, 'active', false) . '>Active</option><option value="inactive" ' . selected($state, 'inactive', false) . '>Inactive</option><option value="failed" ' . selected($state, 'failed', false) . '>Erori / suspendate</option></select></label><button class="button" type="submit">Filtrează</button></form>';
        echo '<table class="widefat striped eani-table"><thead><tr><th>Sursă</th><th>Regiune</th><th>Flux</th><th>Stare</th><th>Ultima verificare</th><th>Acțiuni</th></tr></thead><tbody>';
        foreach ((array) $rows as $row) {
            $toggle_url = wp_nonce_url(admin_url('admin-post.php?action=eani_global_toggle_source&id=' . (int) $row['id']), 'eani_global_toggle_' . (int) $row['id']);
            echo '<tr><td><strong>' . esc_html($row['name']) . '</strong><br><span class="eani-muted">' . esc_html($row['country'] . ' · ' . strtoupper($row['language'])) . '</span></td>';
            echo '<td>' . esc_html($row['region']) . '</td>';
            echo '<td><a href="' . esc_url($row['feed_url']) . '" target="_blank" rel="noopener">Deschide RSS</a><br><span class="eani-muted">' . esc_html($row['content_mode']) . '</span></td>';
            echo '<td><span class="eani-status ' . esc_attr($row['last_status']) . '">' . esc_html($row['active'] ? $row['last_status'] : 'inactive') . '</span>';
            if (!empty($row['last_error'])) {
                echo '<br><small>' . esc_html(wp_trim_words($row['last_error'], 12, '…')) . '</small>';
            }
            echo '</td><td>' . esc_html($row['last_checked'] ? $row['last_checked'] . ' UTC' : 'Niciodată') . '</td><td><a class="button button-small" href="' . esc_url($toggle_url) . '">' . esc_html($row['active'] ? 'Dezactivează' : 'Activează') . '</a> ';
            echo '<form class="eani-inline" method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="eani_global_test_source"><input type="hidden" name="id" value="' . (int) $row['id'] . '">';
            wp_nonce_field('eani_global_test_' . (int) $row['id']);
            echo '<button class="button button-small" type="submit">Testează</button></form></td></tr>';
        }
        if (!$rows) {
            echo '<tr><td colspan="6">Nu există surse pentru filtrul selectat.</td></tr>';
        }
        echo '</tbody></table>';
        $pages = max(1, (int) ceil($total / $per_page));
        echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page_num, 'total' => $pages])) . '</div></div></div>';
    }

    public static function render_catalog() {
        global $wpdb;
        $table = self::sources_table();
        $regions = $wpdb->get_results("SELECT region, COUNT(*) total, SUM(active = 1) active, SUM(last_status = 'verified') verified, SUM(last_status IN ('failed','paused')) problematic FROM {$table} GROUP BY region ORDER BY region ASC", ARRAY_A);
        echo '<div class="wrap eani-wrap"><h1>Catalog global</h1><p>Sursele noi sunt active implicit. Importatorul le procesează pe rând și suspendă temporar numai fluxurile care eșuează repetat.</p>';
        echo '<div class="eani-actions">';
        self::action_form('eani_global_sync_catalog', 'eani_global_sync_catalog', 'Sincronizează sursele noi', 'button button-primary');
        self::action_form('eani_global_activate_all', 'eani_global_activate_all', 'Activează toate sursele configurate', 'button');
        self::action_form('eani_global_deactivate_all', 'eani_global_deactivate_all', 'Dezactivează toate', 'button');
        echo '</div><div class="eani-grid">';
        foreach ((array) $regions as $region) {
            echo '<div class="eani-card"><h2>' . esc_html($region['region']) . '</h2><div class="eani-value">' . (int) $region['active'] . ' / ' . (int) $region['total'] . '</div><p class="eani-muted">active · ' . (int) $region['verified'] . ' verificate · ' . (int) $region['problematic'] . ' cu probleme</p><a class="button" href="' . esc_url(add_query_arg(['page' => 'eani-global-sources', 'region' => $region['region']], admin_url('admin.php'))) . '">Vezi sursele</a></div>';
        }
        echo '</div><div class="eani-warning"><strong>Regim editorial:</strong> publicațiile comerciale sunt configurate implicit în modul titlu + link. Rezumatul RSS este utilizat numai pentru surse proprii, publice sau deschise. Verifică termenii fiecărei surse înainte de publicare comercială.</div></div>';
    }

    public static function render_settings() {
        $settings = self::settings();
        $categories = get_categories(['hide_empty' => false]);
        echo '<div class="wrap eani-wrap"><h1>Setări</h1><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="eani_global_save_settings">';
        wp_nonce_field('eani_global_save_settings');
        echo '<table class="form-table"><tbody>';
        echo '<tr><th><label for="eani-post-status">Starea articolelor</label></th><td><select id="eani-post-status" name="settings[post_status]"><option value="draft" ' . selected($settings['post_status'], 'draft', false) . '>Ciornă</option><option value="pending" ' . selected($settings['post_status'], 'pending', false) . '>În așteptare</option><option value="publish" ' . selected($settings['post_status'], 'publish', false) . '>Publicat</option></select><p class="description">Recomandat: Ciornă.</p></td></tr>';
        echo '<tr><th>Surse per rulare</th><td><input type="number" min="1" max="50" name="settings[batch_size]" value="' . (int) $settings['batch_size'] . '"></td></tr>';
        echo '<tr><th>Articole noi per sursă</th><td><input type="number" min="1" max="5" name="settings[max_items_per_source]" value="' . (int) $settings['max_items_per_source'] . '"></td></tr>';
        echo '<tr><th>Lungime rezumat</th><td><input type="number" min="30" max="250" name="settings[excerpt_words]" value="' . (int) $settings['excerpt_words'] . '"> cuvinte</td></tr>';
        echo '<tr><th>Circuit breaker</th><td>Suspendă după <input type="number" min="1" max="10" name="settings[pause_failures]" value="' . (int) $settings['pause_failures'] . '"> erori, pentru <input type="number" min="1" max="168" name="settings[pause_hours]" value="' . (int) $settings['pause_hours'] . '"> ore.</td></tr>';
        echo '<tr><th>Categoria implicită</th><td><select name="settings[default_category_id]"><option value="0">Automată după regiune</option>';
        foreach ($categories as $category) {
            echo '<option value="' . (int) $category->term_id . '" ' . selected((int) $settings['default_category_id'], (int) $category->term_id, false) . '>' . esc_html($category->name) . '</option>';
        }
        echo '</select></td></tr>';
        echo '<tr><th>Frontend</th><td><label><input type="checkbox" name="settings[append_source_box]" value="1" ' . checked($settings['append_source_box'], 1, false) . '> Afișează sursa la finalul articolului</label><br><label><input type="checkbox" name="settings[nofollow_source]" value="1" ' . checked($settings['nofollow_source'], 1, false) . '> Adaugă nofollow linkului extern</label></td></tr>';
        echo '</tbody></table><p><button class="button button-primary" type="submit">Salvează setările</button></p></form></div>';
    }

    public static function add_meta_box() {
        add_meta_box('eani-global-editorial', 'Editorial News', [__CLASS__, 'render_meta_box'], 'post', 'side', 'high');
    }

    public static function render_meta_box($post) {
        if (!get_post_meta($post->ID, '_eani_imported', true)) {
            echo '<p>Acest articol nu a fost importat de Editorial News.</p>';
            return;
        }
        wp_nonce_field('eani_global_save_post_' . $post->ID, 'eani_global_post_nonce');
        $approved = get_post_meta($post->ID, '_eani_editorial_approved', true);
        $description = get_post_meta($post->ID, '_eani_meta_description', true);
        $source = get_post_meta($post->ID, '_eani_source_name', true);
        $url = get_post_meta($post->ID, '_eani_source_url', true);
        echo '<p><strong>Sursă:</strong> ' . esc_html($source) . '</p>';
        if ($url) {
            echo '<p><a href="' . esc_url($url) . '" target="_blank" rel="noopener">Deschide materialul original</a></p>';
        }
        echo '<p><label><input type="checkbox" name="eani_editorial_approved" value="1" ' . checked($approved, '1', false) . '> Aprobat editorial pentru indexare</label></p>';
        echo '<p><label for="eani-meta-description"><strong>Meta description</strong></label><textarea id="eani-meta-description" name="eani_meta_description" rows="5" style="width:100%">' . esc_textarea($description) . '</textarea></p>';
        if (!$approved) {
            echo '<p class="description">Articolul rămâne noindex până la aprobarea editorială.</p>';
        }
    }

    public static function save_meta_box($post_id, $post) {
        if (!isset($_POST['eani_global_post_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['eani_global_post_nonce'])), 'eani_global_save_post_' . $post_id)) {
            return;
        }
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        if (!current_user_can('edit_post', $post_id) || $post->post_type !== 'post') {
            return;
        }
        update_post_meta($post_id, '_eani_editorial_approved', !empty($_POST['eani_editorial_approved']) ? '1' : '0');
        if (isset($_POST['eani_meta_description'])) {
            update_post_meta($post_id, '_eani_meta_description', sanitize_textarea_field(wp_unslash($_POST['eani_meta_description'])));
        }
    }

    public static function filter_robots($robots) {
        if (!is_singular('post')) {
            return $robots;
        }
        $post_id = get_queried_object_id();
        if (get_post_meta($post_id, '_eani_imported', true) && get_post_meta($post_id, '_eani_editorial_approved', true) !== '1') {
            $robots['noindex'] = true;
            $robots['follow'] = true;
            unset($robots['index']);
        }
        return $robots;
    }

    private static function has_external_seo_plugin() {
        return defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION') || defined('SEOPRESS_VERSION') || defined('AIOSEO_VERSION');
    }

    public static function output_frontend_seo() {
        if (!is_singular('post')) {
            return;
        }
        $post_id = get_queried_object_id();
        if (!get_post_meta($post_id, '_eani_imported', true) || self::has_external_seo_plugin()) {
            return;
        }
        $post = get_post($post_id);
        $description = get_post_meta($post_id, '_eani_meta_description', true);
        if (!$description) {
            $description = wp_trim_words(wp_strip_all_tags($post->post_excerpt ?: $post->post_content), 28, '…');
        }
        echo "\n" . '<meta name="description" content="' . esc_attr($description) . '">' . "\n";
        echo '<link rel="canonical" href="' . esc_url(get_permalink($post_id)) . '">' . "\n";
        echo '<meta property="og:type" content="article">' . "\n";
        echo '<meta property="og:title" content="' . esc_attr(get_the_title($post_id)) . '">' . "\n";
        echo '<meta property="og:description" content="' . esc_attr($description) . '">' . "\n";
        echo '<meta property="og:url" content="' . esc_url(get_permalink($post_id)) . '">' . "\n";

        if (get_post_meta($post_id, '_eani_editorial_approved', true) === '1' && get_post_status($post_id) === 'publish') {
            $schema = [
                '@context' => 'https://schema.org',
                '@type' => 'NewsArticle',
                'headline' => get_the_title($post_id),
                'description' => $description,
                'datePublished' => get_the_date(DATE_W3C, $post_id),
                'dateModified' => get_the_modified_date(DATE_W3C, $post_id),
                'mainEntityOfPage' => get_permalink($post_id),
                'author' => ['@type' => 'Person', 'name' => get_the_author_meta('display_name', $post->post_author)],
                'publisher' => ['@type' => 'Organization', 'name' => get_bloginfo('name'), 'url' => home_url('/')],
            ];
            $citation = get_post_meta($post_id, '_eani_source_url', true);
            if ($citation) {
                $schema['citation'] = esc_url_raw($citation);
            }
            echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
        }
    }

    public static function append_source_box($content) {
        if (!is_singular('post') || !in_the_loop() || !is_main_query()) {
            return $content;
        }
        $settings = self::settings();
        $post_id = get_the_ID();
        if (empty($settings['append_source_box']) || !get_post_meta($post_id, '_eani_imported', true)) {
            return $content;
        }
        $source = get_post_meta($post_id, '_eani_source_name', true);
        $url = get_post_meta($post_id, '_eani_source_url', true);
        if (!$source || !$url) {
            return $content;
        }
        $rel = !empty($settings['nofollow_source']) ? 'noopener nofollow external' : 'noopener external';
        $box = '<aside class="eani-source-box" style="margin-top:2rem;padding:1rem;border:1px solid #dcdcde;border-radius:8px"><strong>Sursa informației:</strong> <a href="' . esc_url($url) . '" target="_blank" rel="' . esc_attr($rel) . '">' . esc_html($source) . '</a></aside>';
        return $content . $box;
    }

    public static function add_rewrite_rules() {
        add_rewrite_rule('^eani-news-sitemap\.xml$', 'index.php?eani_news_sitemap=1', 'top');
    }

    public static function query_vars($vars) {
        $vars[] = 'eani_news_sitemap';
        return $vars;
    }

    public static function maybe_render_news_sitemap() {
        if (!get_query_var('eani_news_sitemap')) {
            return;
        }
        nocache_headers();
        header('Content-Type: application/xml; charset=UTF-8');
        $query = new WP_Query([
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 1000,
            'date_query' => [['after' => '2 days ago']],
            'meta_query' => [
                ['key' => '_eani_imported', 'value' => '1'],
                ['key' => '_eani_editorial_approved', 'value' => '1'],
            ],
            'orderby' => 'date',
            'order' => 'DESC',
            'no_found_rows' => true,
        ]);
        echo '<?xml version="1.0" encoding="UTF-8"?>';
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">';
        foreach ($query->posts as $post) {
            $lang = get_post_meta($post->ID, '_eani_source_language', true) ?: substr(get_locale(), 0, 2);
            echo '<url><loc>' . esc_xml(get_permalink($post->ID)) . '</loc><news:news><news:publication><news:name>' . esc_xml(get_bloginfo('name')) . '</news:name><news:language>' . esc_xml($lang) . '</news:language></news:publication><news:publication_date>' . esc_xml(get_the_date(DATE_W3C, $post->ID)) . '</news:publication_date><news:title>' . esc_xml(get_the_title($post->ID)) . '</news:title></news:news></url>';
        }
        echo '</urlset>';
        exit;
    }

    public static function robots_txt($output, $public) {
        if ($public) {
            $line = 'Sitemap: ' . home_url('/eani-news-sitemap.xml');
            if (strpos($output, $line) === false) {
                $output .= "\n" . $line . "\n";
            }
        }
        return $output;
    }
}

register_activation_hook(__FILE__, ['EANI_Global_Importer_330', 'activate']);
register_deactivation_hook(__FILE__, ['EANI_Global_Importer_330', 'deactivate']);
EANI_Global_Importer_330::boot();
