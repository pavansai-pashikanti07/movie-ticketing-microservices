import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { getCache, setCache, invalidateCache, checkRedisHealth } from '../config/redis';

// Validation Schemas
const createMovieSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  durationMins: z.number().int().positive(),
  languages: z.array(z.string()).min(1),
  genres: z.array(z.string()).min(1),
  formats: z.array(z.string()).default(['2D']),
  posterUrl: z.string().url().optional(),
  backdropUrl: z.string().url().optional(),
  trailerUrl: z.string().url().optional(),
  censorRating: z.string().default('UA'),
  releaseDate: z.string(),
});

const createShowSchema = z.object({
  movieId: z.number().int().positive(),
  theaterId: z.string().min(1),
  auditoriumId: z.string().min(1),
  showDate: z.string(),
  startTime: z.string(),
  format: z.string().default('2D'),
  language: z.string().default('Telugu'),
  tierPricing: z.record(z.number().positive()),
  status: z.enum(['UPCOMING', 'BOOKINGS_OPEN', 'SOLD_OUT', 'CANCELLED']).default('BOOKINGS_OPEN'),
});

export const getMovies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { language, format, genre } = req.query;
    const cacheKey = `catalog:movies:${language || 'all'}:${format || 'all'}:${genre || 'all'}`;

    // 1. Check Redis Cache
    const cachedData = await getCache<any[]>(cacheKey);
    if (cachedData) {
      res.status(200).json({
        success: true,
        source: 'cache',
        count: cachedData.length,
        data: cachedData,
      });
      return;
    }

    // 2. Query PostgreSQL
    let query = 'SELECT * FROM movies WHERE is_active = true';
    const params: any[] = [];

    if (language) {
      params.push(language as string);
      query += ` AND $${params.length} = ANY(languages)`;
    }

    if (format) {
      params.push(format as string);
      query += ` AND $${params.length} = ANY(formats)`;
    }

    if (genre) {
      params.push(genre as string);
      query += ` AND $${params.length} = ANY(genres)`;
    }

    query += ' ORDER BY release_date DESC';

    const result = await pool.query(query, params);

    // 3. Populate Redis Cache (TTL: 5 minutes)
    await setCache(cacheKey, result.rows, 300);

    res.status(200).json({
      success: true,
      source: 'database',
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('[CatalogController.getMovies] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching movies.' });
  }
};

export const getMovieById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid movie ID format.' });
      return;
    }

    const cacheKey = `catalog:movie:${id}`;
    const cachedMovie = await getCache(cacheKey);
    if (cachedMovie) {
      res.status(200).json({ success: true, source: 'cache', data: cachedMovie });
      return;
    }

    const result = await pool.query('SELECT * FROM movies WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Movie not found.' });
      return;
    }

    const movie = result.rows[0];
    await setCache(cacheKey, movie, 600);

    res.status(200).json({ success: true, source: 'database', data: movie });
  } catch (error) {
    console.error('[CatalogController.getMovieById] Error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving movie details.' });
  }
};

export const getTheaters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { city } = req.query;
    const cacheKey = `catalog:theaters:${city || 'all'}`;

    const cachedTheaters = await getCache(cacheKey);
    if (cachedTheaters) {
      res.status(200).json({ success: true, source: 'cache', data: cachedTheaters });
      return;
    }

    let query = 'SELECT * FROM theaters';
    const params: any[] = [];
    if (city) {
      params.push(city);
      query += ' WHERE city ILIKE $1';
    }
    query += ' ORDER BY name ASC';

    const result = await pool.query(query, params);
    await setCache(cacheKey, result.rows, 600);

    res.status(200).json({ success: true, source: 'database', data: result.rows });
  } catch (error) {
    console.error('[CatalogController.getTheaters] Error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving theaters.' });
  }
};

export const getShows = async (req: Request, res: Response): Promise<void> => {
  try {
    const { movieId, theaterId, date } = req.query;

    let query = `
      SELECT 
        s.id, s.movie_id, m.title AS movie_title, m.poster_url,
        s.theater_id, t.name AS theater_name, t.city, t.area,
        s.auditorium_id, a.name AS auditorium_name, a.screen_type,
        s.show_date, s.start_time, s.format, s.language,
        s.tier_pricing, s.status
      FROM shows s
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN auditoriums a ON s.auditorium_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (movieId) {
      params.push(parseInt(movieId as string, 10));
      query += ` AND s.movie_id = $${params.length}`;
    }

    if (theaterId) {
      params.push(theaterId as string);
      query += ` AND s.theater_id = $${params.length}`;
    }

    if (date) {
      params.push(date as string);
      query += ` AND s.show_date = $${params.length}`;
    }

    query += ' ORDER BY s.show_date ASC, s.start_time ASC';

    const result = await pool.query(query, params);
    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('[CatalogController.getShows] Error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving showtimes.' });
  }
};

export const getShowDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid show ID format.' });
      return;
    }

    const query = `
      SELECT 
        s.id, s.movie_id, m.title AS movie_title, m.duration_mins, m.censor_rating,
        s.theater_id, t.name AS theater_name, t.address AS theater_address,
        s.auditorium_id, a.name AS auditorium_name, a.screen_type, a.total_seats, a.seating_layout,
        s.show_date, s.start_time, s.format, s.language,
        s.tier_pricing, s.status
      FROM shows s
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN auditoriums a ON s.auditorium_id = a.id
      WHERE s.id = $1
    `;

    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Show not found.' });
      return;
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[CatalogController.getShowDetails] Error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving show details.' });
  }
};

export const createMovie = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = createMovieSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
      return;
    }

    const d = parseResult.data;
    const query = `
      INSERT INTO movies (
        title, description, duration_mins, languages, genres, formats,
        poster_url, backdrop_url, trailer_url, censor_rating, release_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await pool.query(query, [
      d.title,
      d.description || null,
      d.durationMins,
      d.languages,
      d.genres,
      d.formats,
      d.posterUrl || null,
      d.backdropUrl || null,
      d.trailerUrl || null,
      d.censorRating,
      d.releaseDate,
    ]);

    // Invalidate cached movie listings
    await invalidateCache('catalog:movies:*');

    res.status(201).json({
      success: true,
      message: 'Movie created successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[CatalogController.createMovie] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create movie record.' });
  }
};

export const createShow = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = createShowSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
      return;
    }

    const d = parseResult.data;
    const query = `
      INSERT INTO shows (
        movie_id, theater_id, auditorium_id, show_date, start_time,
        format, language, tier_pricing, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(query, [
      d.movieId,
      d.theaterId,
      d.auditoriumId,
      d.showDate,
      d.startTime,
      d.format,
      d.language,
      JSON.stringify(d.tierPricing),
      d.status,
    ]);

    res.status(201).json({
      success: true,
      message: 'Showtime scheduled successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[CatalogController.createShow] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to schedule showtime.' });
  }
};

export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('SELECT 1');
    const redisHealthy = checkRedisHealth();

    res.status(200).json({
      status: 'UP',
      service: 'cinepass-catalog-service',
      database: 'CONNECTED',
      cache: redisHealthy ? 'CONNECTED' : 'DEGRADED_DB_FALLBACK',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      service: 'cinepass-catalog-service',
      database: 'DISCONNECTED',
      timestamp: new Date().toISOString(),
      error: (err as Error).message,
    });
  }
};
