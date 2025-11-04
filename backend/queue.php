<?php
/**
 * Queue Management System
 *
 * Verwaltet die Konvertierungs-Queue mit SQLite
 */

class ConversionQueue {
    private $db;
    private $dbPath;

    public function __construct($dbPath = null) {
        if ($dbPath === null) {
            $dbPath = __DIR__ . '/queue.db';
        }
        $this->dbPath = $dbPath;
        $this->initDatabase();
    }

    private function initDatabase() {
        $this->db = new PDO('sqlite:' . $this->dbPath);
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // Erstelle Tabelle falls nicht vorhanden
        $this->db->exec('
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT "pending",
                priority INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                started_at INTEGER,
                finished_at INTEGER,
                error TEXT,
                INDEX(status),
                INDEX(priority)
            )
        ');
    }

    /**
     * Fügt eine neue Session zur Queue hinzu
     */
    public function addToQueue($sessionId, $priority = 0) {
        $stmt = $this->db->prepare('
            INSERT INTO queue (session_id, status, priority, created_at)
            VALUES (:session_id, "pending", :priority, :created_at)
        ');

        return $stmt->execute([
            ':session_id' => $sessionId,
            ':priority' => $priority,
            ':created_at' => time()
        ]);
    }

    /**
     * Gibt die aktuelle Position in der Queue zurück
     */
    public function getQueuePosition($sessionId) {
        $stmt = $this->db->prepare('
            SELECT COUNT(*) as position
            FROM queue
            WHERE status = "pending"
            AND (priority > (SELECT priority FROM queue WHERE session_id = :session_id)
                 OR (priority = (SELECT priority FROM queue WHERE session_id = :session_id)
                     AND created_at < (SELECT created_at FROM queue WHERE session_id = :session_id)))
        ');

        $stmt->execute([':session_id' => $sessionId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        return $result['position'] + 1; // +1 weil Position bei 1 startet
    }

    /**
     * Holt die nächste zu bearbeitende Session
     */
    public function getNextJob() {
        $stmt = $this->db->query('
            SELECT session_id
            FROM queue
            WHERE status = "pending"
            ORDER BY priority DESC, created_at ASC
            LIMIT 1
        ');

        return $stmt->fetchColumn();
    }

    /**
     * Markiert einen Job als "in Bearbeitung"
     */
    public function markAsProcessing($sessionId) {
        $stmt = $this->db->prepare('
            UPDATE queue
            SET status = "processing", started_at = :started_at
            WHERE session_id = :session_id
        ');

        return $stmt->execute([
            ':session_id' => $sessionId,
            ':started_at' => time()
        ]);
    }

    /**
     * Markiert einen Job als "fertig"
     */
    public function markAsCompleted($sessionId) {
        $stmt = $this->db->prepare('
            UPDATE queue
            SET status = "completed", finished_at = :finished_at
            WHERE session_id = :session_id
        ');

        return $stmt->execute([
            ':session_id' => $sessionId,
            ':finished_at' => time()
        ]);
    }

    /**
     * Markiert einen Job als "fehlgeschlagen"
     */
    public function markAsFailed($sessionId, $error) {
        $stmt = $this->db->prepare('
            UPDATE queue
            SET status = "failed", finished_at = :finished_at, error = :error
            WHERE session_id = :session_id
        ');

        return $stmt->execute([
            ':session_id' => $sessionId,
            ':finished_at' => time(),
            ':error' => $error
        ]);
    }

    /**
     * Gibt den Status eines Jobs zurück
     */
    public function getStatus($sessionId) {
        $stmt = $this->db->prepare('
            SELECT status, error
            FROM queue
            WHERE session_id = :session_id
        ');

        $stmt->execute([':session_id' => $sessionId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Zählt aktive Jobs (pending + processing)
     */
    public function countActiveJobs() {
        $stmt = $this->db->query('
            SELECT COUNT(*) as count
            FROM queue
            WHERE status IN ("pending", "processing")
        ');

        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result['count'];
    }

    /**
     * Löscht alte abgeschlossene/fehlgeschlagene Jobs
     */
    public function cleanupOldJobs($maxAge = 3600) {
        $cutoff = time() - $maxAge;

        $stmt = $this->db->prepare('
            DELETE FROM queue
            WHERE status IN ("completed", "failed")
            AND finished_at < :cutoff
        ');

        $stmt->execute([':cutoff' => $cutoff]);

        return $stmt->rowCount();
    }

    /**
     * Gibt Statistiken über die Queue zurück
     */
    public function getStats() {
        $stmt = $this->db->query('
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = "processing" THEN 1 ELSE 0 END) as processing,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed
            FROM queue
        ');

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
}
