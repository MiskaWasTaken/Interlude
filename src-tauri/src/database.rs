//! Database Module
//! SQLite-based storage for library metadata

use rusqlite::{Connection, Result, params};
use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub file_path: String,
    pub file_hash: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub disc_number: Option<i32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub duration: f64,
    pub sample_rate: i32,
    pub bit_depth: i32,
    pub channels: i32,
    pub file_size: i64,
    pub format: String,
    pub has_artwork: bool,
    pub play_count: i32,
    pub last_played: Option<String>,
    pub date_added: String,
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: i64,
    pub name: String,
    pub artist: String,
    pub year: Option<i32>,
    pub track_count: i32,
    pub total_duration: f64,
    pub artwork_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artist {
    pub id: i64,
    pub name: String,
    pub album_count: i32,
    pub track_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub enabled: bool,
    pub last_scanned: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Statistics {
    pub total_tracks: i64,
    pub total_albums: i64,
    pub total_artists: i64,
    pub total_duration: f64,
    pub total_size: i64,
    pub hires_tracks: i64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.initialize()?;
        Ok(db)
    }

    fn initialize(&self) -> Result<()> {
        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                file_hash TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                album_artist TEXT,
                track_number INTEGER,
                disc_number INTEGER,
                year INTEGER,
                genre TEXT,
                duration REAL NOT NULL,
                sample_rate INTEGER NOT NULL,
                bit_depth INTEGER NOT NULL,
                channels INTEGER NOT NULL,
                file_size INTEGER NOT NULL,
                format TEXT NOT NULL,
                has_artwork INTEGER DEFAULT 0,
                play_count INTEGER DEFAULT 0,
                last_played TEXT,
                date_added TEXT NOT NULL,
                is_favorite INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS library_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                enabled INTEGER DEFAULT 1,
                last_scanned TEXT
            );

            CREATE TABLE IF NOT EXISTS play_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                played_at TEXT NOT NULL,
                FOREIGN KEY (track_id) REFERENCES tracks(id)
            );

            CREATE TABLE IF NOT EXISTS lyrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                is_synced INTEGER DEFAULT 0,
                source TEXT,
                FOREIGN KEY (track_id) REFERENCES tracks(id)
            );

            CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
            CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
            CREATE INDEX IF NOT EXISTS idx_tracks_file_hash ON tracks(file_hash);
            CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
            CREATE INDEX IF NOT EXISTS idx_play_history_date ON play_history(played_at);
        "#)?;
        Ok(())
    }

    pub fn insert_track(&self, track: &Track) -> Result<i64> {
        self.conn.execute(
            r#"INSERT OR REPLACE INTO tracks 
               (file_path, file_hash, title, artist, album, album_artist, track_number, 
                disc_number, year, genre, duration, sample_rate, bit_depth, channels, 
                file_size, format, has_artwork, date_added, is_favorite)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)"#,
            params![
                track.file_path,
                track.file_hash,
                track.title,
                track.artist,
                track.album,
                track.album_artist,
                track.track_number,
                track.disc_number,
                track.year,
                track.genre,
                track.duration,
                track.sample_rate,
                track.bit_depth,
                track.channels,
                track.file_size,
                track.format,
                track.has_artwork as i32,
                track.date_added,
                track.is_favorite as i32,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_all_tracks(&self) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM tracks ORDER BY artist, album, disc_number, track_number"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        })?;

        tracks.collect()
    }

    pub fn get_all_albums(&self) -> Result<Vec<Album>> {
        let mut stmt = self.conn.prepare(r#"
            SELECT 
                ROW_NUMBER() OVER (ORDER BY album, artist) as id,
                album as name,
                artist,
                year,
                COUNT(*) as track_count,
                SUM(duration) as total_duration
            FROM tracks
            GROUP BY album, artist
            ORDER BY album
        "#)?;

        let albums = stmt.query_map([], |row| {
            Ok(Album {
                id: row.get(0)?,
                name: row.get(1)?,
                artist: row.get(2)?,
                year: row.get(3)?,
                track_count: row.get(4)?,
                total_duration: row.get(5)?,
                artwork_path: None,
            })
        })?;

        albums.collect()
    }

    pub fn get_all_artists(&self) -> Result<Vec<Artist>> {
        let mut stmt = self.conn.prepare(r#"
            SELECT 
                ROW_NUMBER() OVER (ORDER BY artist) as id,
                artist as name,
                COUNT(DISTINCT album) as album_count,
                COUNT(*) as track_count
            FROM tracks
            GROUP BY artist
            ORDER BY artist
        "#)?;

        let artists = stmt.query_map([], |row| {
            Ok(Artist {
                id: row.get(0)?,
                name: row.get(1)?,
                album_count: row.get(2)?,
                track_count: row.get(3)?,
            })
        })?;

        artists.collect()
    }

    pub fn get_album_tracks(&self, album: &str, artist: &str) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM tracks WHERE album = ?1 AND artist = ?2 ORDER BY disc_number, track_number"
        )?;
        
        let tracks = stmt.query_map(params![album, artist], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        })?;

        tracks.collect()
    }

    pub fn get_artist_albums(&self, artist: &str) -> Result<Vec<Album>> {
        let mut stmt = self.conn.prepare(r#"
            SELECT 
                ROW_NUMBER() OVER (ORDER BY album) as id,
                album as name,
                artist,
                year,
                COUNT(*) as track_count,
                SUM(duration) as total_duration
            FROM tracks
            WHERE artist = ?1
            GROUP BY album
            ORDER BY year DESC, album
        "#)?;

        let albums = stmt.query_map(params![artist], |row| {
            Ok(Album {
                id: row.get(0)?,
                name: row.get(1)?,
                artist: row.get(2)?,
                year: row.get(3)?,
                track_count: row.get(4)?,
                total_duration: row.get(5)?,
                artwork_path: None,
            })
        })?;

        albums.collect()
    }

    pub fn add_library_folder(&self, path: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT OR IGNORE INTO library_folders (path) VALUES (?1)",
            params![path],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn remove_library_folder(&self, path: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM library_folders WHERE path = ?1",
            params![path],
        )?;
        // Also remove tracks from this folder
        self.conn.execute(
            "DELETE FROM tracks WHERE file_path LIKE ?1 || '%'",
            params![path],
        )?;
        Ok(())
    }

    pub fn get_library_folders(&self) -> Result<Vec<LibraryFolder>> {
        let mut stmt = self.conn.prepare("SELECT * FROM library_folders")?;
        
        let folders = stmt.query_map([], |row| {
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                enabled: row.get::<_, i32>(2)? != 0,
                last_scanned: row.get(3)?,
            })
        })?;

        folders.collect()
    }

    pub fn update_folder_scanned(&self, path: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE library_folders SET last_scanned = datetime('now') WHERE path = ?1",
            params![path],
        )?;
        Ok(())
    }

    pub fn record_play(&self, track_id: i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO play_history (track_id, played_at) VALUES (?1, datetime('now'))",
            params![track_id],
        )?;
        self.conn.execute(
            "UPDATE tracks SET play_count = play_count + 1, last_played = datetime('now') WHERE id = ?1",
            params![track_id],
        )?;
        Ok(())
    }

    pub fn get_recently_played(&self, limit: i32) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(r#"
            SELECT t.* FROM tracks t
            INNER JOIN play_history h ON t.id = h.track_id
            GROUP BY t.id
            ORDER BY MAX(h.played_at) DESC
            LIMIT ?1
        "#)?;
        
        let tracks = stmt.query_map(params![limit], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        })?;

        tracks.collect()
    }

    pub fn set_favorite(&self, track_id: i64, is_favorite: bool) -> Result<()> {
        self.conn.execute(
            "UPDATE tracks SET is_favorite = ?2 WHERE id = ?1",
            params![track_id, is_favorite as i32],
        )?;
        Ok(())
    }

    pub fn get_favorites(&self) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM tracks WHERE is_favorite = 1 ORDER BY artist, album, track_number"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        })?;

        tracks.collect()
    }

    pub fn get_statistics(&self) -> Result<Statistics> {
        let mut stmt = self.conn.prepare(r#"
            SELECT 
                COUNT(*) as total_tracks,
                COUNT(DISTINCT album || artist) as total_albums,
                COUNT(DISTINCT artist) as total_artists,
                COALESCE(SUM(duration), 0) as total_duration,
                COALESCE(SUM(file_size), 0) as total_size,
                COALESCE(SUM(CASE WHEN bit_depth >= 24 THEN 1 ELSE 0 END), 0) as hires_tracks
            FROM tracks
        "#)?;

        stmt.query_row([], |row| {
            Ok(Statistics {
                total_tracks: row.get(0)?,
                total_albums: row.get(1)?,
                total_artists: row.get(2)?,
                total_duration: row.get(3)?,
                total_size: row.get(4)?,
                hires_tracks: row.get(5)?,
            })
        })
    }

    pub fn search(&self, query: &str) -> Result<Vec<Track>> {
        let search_term = format!("%{}%", query);
        let mut stmt = self.conn.prepare(r#"
            SELECT * FROM tracks 
            WHERE title LIKE ?1 OR artist LIKE ?1 OR album LIKE ?1
            ORDER BY 
                CASE 
                    WHEN title LIKE ?1 THEN 1
                    WHEN artist LIKE ?1 THEN 2
                    WHEN album LIKE ?1 THEN 3
                END,
                artist, album, track_number
            LIMIT 100
        "#)?;
        
        let tracks = stmt.query_map(params![search_term], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        })?;

        tracks.collect()
    }

    pub fn get_track_by_path(&self, path: &str) -> Result<Option<Track>> {
        let mut stmt = self.conn.prepare("SELECT * FROM tracks WHERE file_path = ?1")?;
        
        let result = stmt.query_row(params![path], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        });

        match result {
            Ok(track) => Ok(Some(track)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn track_exists(&self, file_hash: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare("SELECT 1 FROM tracks WHERE file_hash = ?1 LIMIT 1")?;
        let exists = stmt.exists(params![file_hash])?;
        Ok(exists)
    }

    pub fn save_lyrics(&self, track_id: i64, content: &str, is_synced: bool) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO lyrics (track_id, content, is_synced) VALUES (?1, ?2, ?3)",
            params![track_id, content, is_synced as i32],
        )?;
        Ok(())
    }

    pub fn get_lyrics(&self, track_id: i64) -> Result<Option<(String, bool)>> {
        let mut stmt = self.conn.prepare("SELECT content, is_synced FROM lyrics WHERE track_id = ?1")?;
        
        let result = stmt.query_row(params![track_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)? != 0))
        });

        match result {
            Ok(lyrics) => Ok(Some(lyrics)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn get_hires_tracks(&self) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM tracks WHERE bit_depth >= 24 ORDER BY artist, album, track_number"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        })?;

        tracks.collect()
    }

    pub fn get_recently_added(&self, limit: i32) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM tracks ORDER BY date_added DESC LIMIT ?1"
        )?;
        
        let tracks = stmt.query_map(params![limit], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                sample_rate: row.get(12)?,
                bit_depth: row.get(13)?,
                channels: row.get(14)?,
                file_size: row.get(15)?,
                format: row.get(16)?,
                has_artwork: row.get::<_, i32>(17)? != 0,
                play_count: row.get(18)?,
                last_played: row.get(19)?,
                date_added: row.get(20)?,
                is_favorite: row.get::<_, i32>(21)? != 0,
            })
        })?;

        tracks.collect()
    }
}
