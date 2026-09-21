import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'cinepass_admin',
  password: process.env.DB_PASSWORD || 'PavanPassword123!',
  database: process.env.DB_NAME || 'cinepass',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export const initDb = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    try {
      console.log('[DB] Connected to PostgreSQL. Verifying catalog schemas...');

      // 1. Movies Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS movies (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          duration_mins INTEGER NOT NULL,
          languages TEXT[] NOT NULL DEFAULT '{"Telugu"}',
          genres TEXT[] NOT NULL DEFAULT '{"Action"}',
          formats TEXT[] NOT NULL DEFAULT '{"2D"}',
          poster_url TEXT,
          backdrop_url TEXT,
          trailer_url TEXT,
          censor_rating VARCHAR(10) DEFAULT 'UA',
          release_date DATE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
        CREATE INDEX IF NOT EXISTS idx_movies_is_active ON movies(is_active);
      `);

      // 2. Theaters Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS theaters (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          city VARCHAR(100) NOT NULL,
          area VARCHAR(150) NOT NULL,
          address TEXT NOT NULL,
          total_screens INTEGER DEFAULT 1,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_theaters_city ON theaters(city);
      `);

      // 3. Auditoriums Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS auditoriums (
          id VARCHAR(100) PRIMARY KEY,
          theater_id VARCHAR(100) NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          screen_type VARCHAR(50) DEFAULT 'Standard',
          total_seats INTEGER NOT NULL,
          seating_layout JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_auditoriums_theater ON auditoriums(theater_id);
      `);

      // 4. Shows Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS shows (
          id SERIAL PRIMARY KEY,
          movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          theater_id VARCHAR(100) NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
          auditorium_id VARCHAR(100) NOT NULL REFERENCES auditoriums(id) ON DELETE CASCADE,
          show_date DATE NOT NULL,
          start_time VARCHAR(20) NOT NULL,
          format VARCHAR(20) DEFAULT '2D',
          language VARCHAR(50) DEFAULT 'Telugu',
          tier_pricing JSONB NOT NULL,
          status VARCHAR(50) DEFAULT 'BOOKINGS_OPEN',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_shows_lookup ON shows(movie_id, show_date, status);
        CREATE INDEX IF NOT EXISTS idx_shows_theater ON shows(theater_id, show_date);
      `);

      // Seed Initial Theaters if empty
      const existingTheaters = await client.query('SELECT COUNT(*) FROM theaters');
      if (parseInt(existingTheaters.rows[0].count, 10) === 0) {
        console.log('[DB] Seeding multiplex theaters...');
        await client.query(`
          INSERT INTO theaters (id, name, city, area, address, total_screens) VALUES
          ('amb-gachibowli', 'AMB Cinemas: Gachibowli', 'Hyderabad', 'Gachibowli', 'Sarath City Capital Mall, Gachibowli', 7),
          ('pvr-next-galleria', 'PVR Inox: Next Galleria Mall', 'Hyderabad', 'Panjagutta', 'Next Galleria Mall, Irrum Manzil', 5),
          ('prasads-multiplex', 'Prasads Multiplex: Large Screen', 'Hyderabad', 'Necklace Road', 'NTR Gardens, Necklace Road', 6);
        `);

        // Seed Auditoriums with standard 60-seat layout (Rows A to F, 10 seats each)
        const sampleLayout = {
          rows: ['A', 'B', 'C', 'D', 'E', 'F'],
          seatsPerRow: 10,
          tiers: {
            RECLINER: ['A', 'B'],
            PRIME: ['C', 'D'],
            CLASSIC: ['E', 'F'],
          },
        };

        await client.query(`
          INSERT INTO auditoriums (id, theater_id, name, screen_type, total_seats, seating_layout) VALUES
          ('amb-screen-1', 'amb-gachibowli', 'Screen 1 (Laser IMAX)', 'IMAX', 60, $1),
          ('amb-screen-2', 'amb-gachibowli', 'Screen 2 (Dolby Atmos)', 'Dolby Atmos', 60, $1),
          ('pvr-audi-1', 'pvr-next-galleria', 'Audi 1 (4K RGB)', 'Standard', 60, $1),
          ('prasads-large-screen', 'prasads-multiplex', 'Large Screen (IMAX 70mm)', 'IMAX', 60, $1);
        `, [JSON.stringify(sampleLayout)]);
      }

      // Seed Blockbuster Movies if empty
      const existingMovies = await client.query('SELECT COUNT(*) FROM movies');
      if (parseInt(existingMovies.rows[0].count, 10) === 0) {
        console.log('[DB] Seeding blockbuster movie catalog...');
        await client.query(`
          INSERT INTO movies (title, description, duration_mins, languages, genres, formats, poster_url, backdrop_url, censor_rating, release_date) VALUES
          ('Pushpa 2: The Rule', 'The clash between Pushpa Raj and Bhanwar Singh Shekhawat intensifies across international syndicate borders.', 195, '{"Telugu","Hindi","Tamil","Kannada","Malayalam"}', '{"Action","Crime","Drama"}', '{"2D","3D","IMAX"}', 'https://assets.cinepass.com/posters/pushpa2.webp', 'https://assets.cinepass.com/backdrops/pushpa2_bg.webp', 'UA', '2026-10-05'),
          ('Kalki 2898 AD', 'A modern-day avatar of Vishnu descends to protect the world from evil forces in a dystopian post-apocalyptic future.', 181, '{"Telugu","Hindi","Tamil"}', '{"Sci-Fi","Mythology","Action"}', '{"3D","IMAX 3D"}', 'https://assets.cinepass.com/posters/kalki.webp', 'https://assets.cinepass.com/backdrops/kalki_bg.webp', 'UA', '2026-06-27'),
          ('Devara: Part 1', 'An epic sea-bound saga of courage, brotherhood, and raw power commanded by Devara.', 178, '{"Telugu","Hindi","Tamil"}', '{"Action","Period Drama"}', '{"2D","IMAX"}', 'https://assets.cinepass.com/posters/devara.webp', 'https://assets.cinepass.com/backdrops/devara_bg.webp', 'UA', '2026-09-27'),
          ('They Call Him OG', 'A ruthless samurai boss returns to Mumbai underworld to seek revenge on betrayal.', 165, '{"Telugu"}', '{"Action","Crime","Gangster"}', '{"2D"}', 'https://assets.cinepass.com/posters/og.webp', 'https://assets.cinepass.com/backdrops/og_bg.webp', 'A', '2026-11-15');
        `);

        // Seed Shows for today and upcoming dates
        const movieRes = await client.query('SELECT id FROM movies LIMIT 1');
        const movieId = movieRes.rows[0].id;
        const today = new Date().toISOString().split('T')[0];

        const tierPricing = {
          RECLINER: 450,
          PRIME: 295,
          CLASSIC: 175,
        };

        await client.query(`
          INSERT INTO shows (movie_id, theater_id, auditorium_id, show_date, start_time, format, language, tier_pricing, status) VALUES
          ($1, 'amb-gachibowli', 'amb-screen-1', $2, '11:15 AM', 'IMAX', 'Telugu', $3, 'BOOKINGS_OPEN'),
          ($1, 'amb-gachibowli', 'amb-screen-1', $2, '03:00 PM', 'IMAX', 'Telugu', $3, 'BOOKINGS_OPEN'),
          ($1, 'amb-gachibowli', 'amb-screen-1', $2, '06:45 PM', 'IMAX', 'Telugu', $3, 'BOOKINGS_OPEN'),
          ($1, 'amb-gachibowli', 'amb-screen-1', $2, '10:30 PM', 'IMAX', 'Telugu', $3, 'BOOKINGS_OPEN'),
          ($1, 'prasads-multiplex', 'prasads-large-screen', $2, '07:00 PM', 'IMAX', 'Telugu', $3, 'BOOKINGS_OPEN');
        `, [movieId, today, JSON.stringify(tierPricing)]);
      }

      console.log('[DB] Catalog schema and seed data verified successfully.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[DB] Catalog initialization warning (will retry on connection):', error);
  }
};
