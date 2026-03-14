const pool = require("../../../config/database");

class Blotter {
  // Generate blotter entry number
  static async generateBlotterNumber() {
  const year = new Date().getFullYear();
  
  // Only count REAL manual entries
  // Excludes: SEED-XXXX (dev data) and IMP-XXXX (excel imports)
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM blotter_entries 
     WHERE EXTRACT(YEAR FROM created_at) = $1
     AND blotter_entry_number NOT LIKE 'SEED-%'
     AND blotter_entry_number NOT LIKE 'IMP-%'`,
    [year]
  );
  
  const count = parseInt(result.rows[0].count) + 1;
  const sequencePart = count.toString().padStart(6, '0');
  const randomPart = Math.floor(Math.random() * 99999 + 1)
    .toString().padStart(5, '0');
  
  return `${year}-${sequencePart}-${randomPart}`;
}
static async generateImportNumber(year) {
  const importYear = year || new Date().getFullYear();
  
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM blotter_entries 
     WHERE blotter_entry_number LIKE $1`,
    [`IMP-${importYear}-%`]
  );
  
  const count = parseInt(result.rows[0].count) + 1;
  return `IMP-${importYear}-${count.toString().padStart(4, '0')}`;
}

  // Create blotter entry with complainants, suspects, and offenses
  static async create(blotterData, complainants, suspects, offenses) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Generate blotter number
      const blotterNumber = await this.generateBlotterNumber();
      
      // Insert blotter entry
      const blotterResult = await client.query(
        `INSERT INTO blotter_entries (
          blotter_entry_number, incident_type, cop, 
          date_time_commission, date_time_reported,
          place_region, place_district_province, place_city_municipality,
          place_barangay, place_street, is_private_place,
          narrative, amount_involved, referred_by_barangay,
          referred_by_dilg, status, lat, lng
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING blotter_id`,
        [
          blotterNumber, blotterData.incident_type, blotterData.cop,
          blotterData.date_time_commission, blotterData.date_time_reported,
          blotterData.place_region,
          blotterData.place_district_province, blotterData.place_city_municipality,
          blotterData.place_barangay, blotterData.place_street,
          blotterData.is_private_place || null, blotterData.narrative,
          blotterData.amount_involved || null, blotterData.referred_by_barangay,
          blotterData.referred_by_dilg, 'Pending',
          blotterData.lat || null, blotterData.lng || null
        ]
      );
      
      const blotterId = blotterResult.rows[0].blotter_id;
      
      // Insert complainants
      for (const complainant of complainants) {
        await client.query(
          `INSERT INTO complainants (
            blotter_id, first_name, middle_name, last_name, qualifier, alias,
            gender, nationality, contact_number, region, district_province,
            city_municipality, barangay, house_street, info_obtained, occupation,
            region_code, province_code, municipality_code, barangay_code
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            blotterId, complainant.first_name, complainant.middle_name || null,
            complainant.last_name, complainant.qualifier || null, complainant.alias || null,
            complainant.gender, complainant.nationality, complainant.contact_number || null,
            complainant.region, complainant.district_province,
            complainant.city_municipality, complainant.barangay,
            complainant.house_street, complainant.info_obtained,
            complainant.occupation || null,
            complainant.region_code || null, complainant.province_code || null,
            complainant.municipality_code || null, complainant.barangay_code || null
          ]
        );
      }
      
      // Insert suspects
      for (const suspect of suspects) {
        await client.query(
          `INSERT INTO suspects (
              blotter_id, first_name, middle_name, last_name, qualifier, alias,
              gender, birthday, age, birth_place, nationality, region,
              district_province, city_municipality, barangay, house_street,
              status, location_if_arrested, degree_participation,
              relation_to_victim, educational_attainment,
              height_cm, drug_used, motive, occupation,
              region_code, province_code, municipality_code, barangay_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`,
            [
              blotterId, suspect.first_name, suspect.middle_name || null,
              suspect.last_name, suspect.qualifier || null, suspect.alias || null,
              suspect.gender, suspect.birthday || null, suspect.age || null,
              suspect.birth_place || null, suspect.nationality, suspect.region,
              suspect.district_province, suspect.city_municipality,
              suspect.barangay, suspect.house_street, suspect.status,
              suspect.location_if_arrested || null, suspect.degree_participation,
              suspect.relation_to_victim || null,
              suspect.educational_attainment || null, suspect.height_cm || null,
              suspect.drug_used, suspect.motive || null, suspect.occupation || null,
              suspect.region_code || null, suspect.province_code || null,
              suspect.municipality_code || null, suspect.barangay_code || null
            ]
        );
      }
      
      // Insert offenses
      for (const offense of offenses) {
        await client.query(
          `INSERT INTO offenses (
            blotter_id, is_principal_offense, offense_name,
            stage_of_felony, index_type, investigator_on_case,
            most_investigator
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            blotterId, offense.is_principal_offense,
            offense.offense_name, offense.stage_of_felony, offense.index_type,
            offense.investigator_on_case, offense.most_investigator
          ]
        );
      }
            
          // Save type_of_place
    if (blotterData.type_of_place) {
      await client.query(
        `UPDATE blotter_entries SET type_of_place = $1 WHERE blotter_id = $2`,
        [blotterData.type_of_place, blotterId]
      );
    }

    // Save modus selections
    if (blotterData.modus_reference_ids && blotterData.modus_reference_ids.length > 0) {
      for (const modusId of blotterData.modus_reference_ids) {
        await client.query(
          `INSERT INTO crime_modus (blotter_id, modus_reference_id) VALUES ($1, $2)`,
          [blotterId, modusId]
        );
      }
    }

      await client.query('COMMIT');
      
      return {
        blotter_id: blotterId,
        blotter_entry_number: blotterNumber
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all blotter entries with filters
  static async getAll(filters = {}) {
    let query = `SELECT * FROM blotter_entries WHERE is_deleted = false`;
    const params = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    if (filters.incident_type) {
      query += ` AND incident_type = $${paramCount}`;
      params.push(filters.incident_type);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (blotter_entry_number ILIKE $${paramCount} OR narrative ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    if (filters.date_from) {
      query += ` AND date_time_reported >= $${paramCount}`;
      params.push(filters.date_from);
      paramCount++;
    }

    if (filters.date_to) {
    query += ` AND DATE(date_time_reported) <= DATE($${paramCount})`;
    params.push(filters.date_to);
    paramCount++;
  }
  if (filters.barangay) {
  query += ` AND place_barangay = $${paramCount}`;
  params.push(filters.barangay);
  paramCount++;
}

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  // Get blotter by ID with all related data
  static async getById(blotterId) {
    const blotter = await pool.query(
      `SELECT * FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [blotterId]
    );
    
    if (blotter.rows.length === 0) {
      return null;
    }
    
    const complainants = await pool.query(
      `SELECT * FROM complainants WHERE blotter_id = $1`,
      [blotterId]
    );
    
    const suspects = await pool.query(
      `SELECT * FROM suspects WHERE blotter_id = $1`,
      [blotterId]
    );
    
    const offenses = await pool.query(
      `SELECT * FROM offenses WHERE blotter_id = $1`,
      [blotterId]
    );
    
    return {
      ...blotter.rows[0],
      complainants: complainants.rows,
      suspects: suspects.rows,
      offenses: offenses.rows
    };
  }

  // Update blotter status
  static async updateStatus(blotterId, status) {
    const result = await pool.query(
      `UPDATE blotter_entries SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE blotter_id = $2 RETURNING *`,
      [status, blotterId]
    );
    return result.rows[0];
  }

  // Delete blotter (cascade will delete related records)
  static async delete(blotterId) {
    const result = await pool.query(
  `UPDATE blotter_entries SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE blotter_id = $1 RETURNING *`,
  [blotterId]
);
    return result.rows[0];
  }

  static async update(blotterId, blotterData, complainants, suspects, offenses) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update blotter entry (WITHOUT changing blotter_entry_number)
    await client.query(
      `UPDATE blotter_entries SET
        incident_type = $1, cop = $2, date_time_commission = $3,
        date_time_reported = $4, place_region = $5,
        place_district_province = $6, place_city_municipality = $7,
        place_barangay = $8, place_street = $9, is_private_place = $10,
        narrative = $11, amount_involved = $12, referred_by_barangay = $13,
        referred_by_dilg = $14, lat = $15, lng = $16,
        updated_at = CURRENT_TIMESTAMP
      WHERE blotter_id = $17`,
      [
        blotterData.incident_type, blotterData.cop, blotterData.date_time_commission,
        blotterData.date_time_reported, blotterData.place_region,
        blotterData.place_district_province, blotterData.place_city_municipality,
        blotterData.place_barangay, blotterData.place_street,
        blotterData.is_private_place || null, blotterData.narrative,
        blotterData.amount_involved || null, blotterData.referred_by_barangay,
        blotterData.referred_by_dilg,
        blotterData.lat || null, blotterData.lng || null,
        blotterId
      ]
    );
    
    // Delete old related records
    await client.query('DELETE FROM complainants WHERE blotter_id = $1', [blotterId]);
    await client.query('DELETE FROM suspects WHERE blotter_id = $1', [blotterId]);
    await client.query('DELETE FROM offenses WHERE blotter_id = $1', [blotterId]);
    
     // Clear old modus
    await client.query('DELETE FROM crime_modus WHERE blotter_id = $1', [blotterId]);

    // Save type_of_place
    if (blotterData.type_of_place) {
      await client.query(
        `UPDATE blotter_entries SET type_of_place = $1 WHERE blotter_id = $2`,
        [blotterData.type_of_place, blotterId]
      );
    }

    // Re-insert modus
    if (blotterData.modus_reference_ids && blotterData.modus_reference_ids.length > 0) {
      for (const modusId of blotterData.modus_reference_ids) {
        await client.query(
          `INSERT INTO crime_modus (blotter_id, modus_reference_id) VALUES ($1, $2)`,
          [blotterId, modusId]
        );
      }
    }

    // Re-insert complainants
    for (const c of complainants) {
      await client.query(
        `INSERT INTO complainants (
          blotter_id, first_name, middle_name, last_name, qualifier, alias,
          gender, nationality, contact_number, region, district_province,
          city_municipality, barangay, house_street, info_obtained, occupation,
          region_code, province_code, municipality_code, barangay_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          blotterId, c.first_name, c.middle_name || null,
          c.last_name, c.qualifier || null, c.alias || null,
          c.gender, c.nationality, c.contact_number || null,
          c.region, c.district_province,
          c.city_municipality, c.barangay,
          c.house_street, c.info_obtained,
          c.occupation || null,
          c.region_code || null, c.province_code || null,
          c.municipality_code || null, c.barangay_code || null
        ]
      );
    }
    
    // Re-insert suspects
    for (const s of suspects) {
      await client.query(
        `INSERT INTO suspects (
          blotter_id, first_name, middle_name, last_name, qualifier, alias,
          gender, birthday, age, birth_place, nationality, region,
          district_province, city_municipality, barangay, house_street,
          status, location_if_arrested, degree_participation,
          relation_to_victim, educational_attainment,
          height_cm, drug_used, motive, occupation,
          region_code, province_code, municipality_code, barangay_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`,
        [
          blotterId, s.first_name, s.middle_name || null,
          s.last_name, s.qualifier || null, s.alias || null,
          s.gender, s.birthday || null, s.age || null,
          s.birth_place || null, s.nationality, s.region,
          s.district_province, s.city_municipality,
          s.barangay, s.house_street, s.status,
          s.location_if_arrested || null, s.degree_participation,
          s.relation_to_victim || null,
          s.educational_attainment || null, s.height_cm || null,
          s.drug_used, s.motive || null, s.occupation || null,
          s.region_code || null, s.province_code || null,
          s.municipality_code || null, s.barangay_code || null
        ]
      );
    }
    
    // Re-insert offenses
    for (const o of offenses) {
      await client.query(
        `INSERT INTO offenses (
            blotter_id, is_principal_offense, offense_name,
            stage_of_felony, index_type, investigator_on_case,
            most_investigator
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            blotterId, o.is_principal_offense,
            o.offense_name, o.stage_of_felony, o.index_type,
            o.investigator_on_case, o.most_investigator
          ]
      );
    }
    
    await client.query('COMMIT');
    return { blotter_id: blotterId };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
static async getDeleted() {
  const result = await pool.query(
    `SELECT * FROM blotter_entries WHERE is_deleted = true ORDER BY deleted_at DESC`
  );
  return result.rows;
}

static async restore(blotterId) {
  const result = await pool.query(
    `UPDATE blotter_entries SET is_deleted = false, deleted_at = NULL 
     WHERE blotter_id = $1 RETURNING *`,
    [blotterId]
  );
  return result.rows[0];
}
// Get blotter by ID with formatted dates (no timezone conversion)
static async getByIdRaw(blotterId) {
  const blotter = await pool.query(
    `SELECT 
      blotter_id,
      blotter_entry_number,
      incident_type,
      cop,
      TO_CHAR(date_time_commission, 'YYYY-MM-DD"T"HH24:MI') as date_time_commission,
      TO_CHAR(date_time_reported, 'YYYY-MM-DD"T"HH24:MI') as date_time_reported,
      place_region,
      place_district_province,
      place_city_municipality,
      place_barangay,
      place_street,
      is_private_place,
      type_of_place,
      narrative,
      amount_involved,
      referred_by_barangay,
      referred_by_dilg,
      status,
      lat,
      lng,
      created_at,
      updated_at
    FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
  [blotterId]
  );
  
  if (blotter.rows.length === 0) {
    return null;
  }
  
  const complainants = await pool.query(
    `SELECT * FROM complainants WHERE blotter_id = $1`,
    [blotterId]
  );
  
  const suspects = await pool.query(
    `SELECT 
      suspect_id,
      blotter_id,
      first_name,
      middle_name,
      last_name,
      qualifier,
      alias,
      gender,
      TO_CHAR(birthday, 'YYYY-MM-DD') as birthday,
      age,
      birth_place,
      nationality,
      region,
      district_province,
      city_municipality,
      barangay,
      house_street,
      status,
      location_if_arrested,
      degree_participation,
      relation_to_victim,
      educational_attainment,
      height_cm,
      drug_used,
      motive,
     occupation,
    region_code,
    province_code,
    municipality_code,
    barangay_code
    FROM suspects WHERE blotter_id = $1`,
    [blotterId]
  );
  
  const offenses = await pool.query(
    `SELECT * FROM offenses WHERE blotter_id = $1`,
    [blotterId]
  );
  
  const modus = await pool.query(
    `SELECT cm.id, cm.modus_reference_id, cmr.modus_name 
     FROM crime_modus cm
     JOIN crime_modus_reference cmr ON cm.modus_reference_id = cmr.id
     WHERE cm.blotter_id = $1`,
    [blotterId]
  );

  return {
    ...blotter.rows[0],
    complainants: complainants.rows,
    suspects: suspects.rows,
    offenses: offenses.rows,
    modus: modus.rows
  };
}
}


module.exports = Blotter;