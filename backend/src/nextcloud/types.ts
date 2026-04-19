/**
 * Minimal typings for the subset of Nextcloud's /serverinfo response we
 * consume. The real payload is far larger; everything we don't read is
 * omitted so stale server versions (that drop or rename a field we ignore)
 * can't break compilation.
 *
 * Upstream: GET /ocs/v2.php/apps/serverinfo/api/v1/info?format=json
 * Header:   NC-Token: <monitoring token>
 * Docs:     https://docs.nextcloud.com/server/latest/admin_manual/monitoring/
 *           (API is the serverinfo app.)
 */

/** The `ocs` envelope Nextcloud wraps every response in. */
export interface NcOcsEnvelope<T> {
  ocs: {
    meta: {
      status: 'ok' | 'failure';
      statuscode: number;
      message?: string;
    };
    data: T;
  };
}

export interface NcServerInfoData {
  nextcloud: NcServerInfoNextcloud;
  server?: NcServerInfoServer;
  activeUsers?: NcActiveUsers;
}

export interface NcServerInfoNextcloud {
  system: {
    /** e.g. "30.0.2.0". */
    version: string;
    /** Free space on NC data partition, in bytes. 0/neg on platforms that can't compute. */
    freespace?: number;
    /**
     * App stats — only `num_updates_available` is relevant; the full
     * installed count lives under `apps.num_installed`.
     */
    apps?: {
      num_installed?: number;
      num_updates_available?: number;
    };
  };
  storage: {
    /** Total registered NC users (enabled + disabled). */
    num_users: number;
    /** Total file count across every user home. */
    num_files: number;
    num_storages?: number;
    num_storages_local?: number;
    num_storages_home?: number;
    num_storages_other?: number;
  };
  shares: {
    /** Count of active outbound shares across all types. */
    num_shares?: number;
    num_shares_user?: number;
    num_shares_groups?: number;
    num_shares_link?: number;
    num_shares_mail?: number;
    num_fed_shares_sent?: number;
    num_fed_shares_received?: number;
  };
}

export interface NcServerInfoServer {
  webserver?: string;
  php?: { version?: string };
  database?: { type?: string; version?: string; size?: number };
}

/**
 * Activity windows reported by NC. Keys are snake_case in the wire format.
 * A fresh server that has never been touched reports zeros.
 */
export interface NcActiveUsers {
  last5minutes?: number;
  last1hour?: number;
  last24hours?: number;
}
