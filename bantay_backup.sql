--
-- PostgreSQL database dump
--

\restrict 6JmzvTilPaB00y0ku3nFkpyNgmXFBRRLLQ3Suqxa8q3qzp5cHq9NlJ8n3suyy7u

-- Dumped from database version 17.8
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: auto_add_patroller(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_add_patroller() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.role_id = 3 THEN
        INSERT INTO active_patroller (officer_id, status)
        VALUES (NEW.user_id, 'Active');
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: auto_update_patroller_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_update_patroller_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Role changed TO patroller
    IF NEW.role_id = 3 AND OLD.role_id != 3 THEN
        INSERT INTO active_patroller (officer_id, status)
        VALUES (NEW.user_id, 'Active');

    -- Role changed AWAY from patroller
    ELSIF OLD.role_id = 3 AND NEW.role_id != 3 THEN
        DELETE FROM active_patroller WHERE officer_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: check_patroller_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_patroller_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (SELECT role_id FROM users WHERE user_id = NEW.officer_id) != 3 THEN
        RAISE EXCEPTION 'User is not a patroller. Only users with role_id = 3 can be added as active patrollers.';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: cleanup_old_otp_req(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_otp_req() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM otp_req WHERE last_request_at < NOW() - INTERVAL '1 day';
    RETURN NEW;
END;
$$;


--
-- Name: cleanup_old_otp_req2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_otp_req2() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM otp_req2 WHERE last_request_at < NOW() - INTERVAL '1 day';
    RETURN NEW;
END;
$$;


--
-- Name: cleanup_old_otp_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_otp_requests() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM otp_requests WHERE last_request_at < NOW() - INTERVAL '1 day';
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column2() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_patroller; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_patroller (
    active_patroller_id integer NOT NULL,
    officer_id uuid NOT NULL,
    mobile_unit_assigned character varying(50),
    status character varying(20) DEFAULT 'Active'::character varying,
    last_login timestamp without time zone,
    CONSTRAINT active_patroller_status_check CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying, 'Off-duty'::character varying])::text[]))),
    CONSTRAINT no_text_unassigned CHECK (((mobile_unit_assigned)::text <> 'Unassigned'::text))
);


--
-- Name: active_patroller_active_patroller_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.active_patroller_active_patroller_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: active_patroller_active_patroller_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.active_patroller_active_patroller_id_seq OWNED BY public.active_patroller.active_patroller_id;


--
-- Name: barangay_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.barangay_details (
    user_id uuid NOT NULL,
    barangay_code character varying(30) NOT NULL
);


--
-- Name: barangay_map_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.barangay_map_data (
    id integer NOT NULL,
    name_kml character varying(100),
    name_db character varying(100) NOT NULL,
    centroid_lat numeric(10,7),
    centroid_lng numeric(10,7),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: barangay_map_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.barangay_map_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: barangay_map_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.barangay_map_data_id_seq OWNED BY public.barangay_map_data.id;


--
-- Name: blotter_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blotter_entries (
    blotter_id integer NOT NULL,
    blotter_entry_number character varying(20) NOT NULL,
    incident_type character varying(100) NOT NULL,
    cop character varying(100) NOT NULL,
    date_time_commission timestamp without time zone NOT NULL,
    date_time_reported timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    place_region character varying(100) NOT NULL,
    place_district_province character varying(100) NOT NULL,
    place_city_municipality character varying(100) NOT NULL,
    place_barangay character varying(100) NOT NULL,
    place_street character varying(200) NOT NULL,
    is_private_place character varying(50),
    narrative text NOT NULL,
    amount_involved numeric(12,2),
    referred_by_barangay boolean NOT NULL,
    referred_by_dilg boolean NOT NULL,
    status character varying(50) DEFAULT 'Pending'::character varying,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    type_of_place character varying(100),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp without time zone,
    lat numeric(10,7),
    lng numeric(10,7),
    modus character varying(255),
    day_of_incident character varying(20),
    month_of_incident character varying(20)
);


--
-- Name: blotter_entries_blotter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blotter_entries_blotter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blotter_entries_blotter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blotter_entries_blotter_id_seq OWNED BY public.blotter_entries.blotter_id;


--
-- Name: case_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_notes (
    id integer NOT NULL,
    case_id integer NOT NULL,
    note text NOT NULL,
    added_by_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: case_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.case_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: case_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.case_notes_id_seq OWNED BY public.case_notes.id;


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id integer NOT NULL,
    blotter_id integer NOT NULL,
    case_number character varying(20) NOT NULL,
    assigned_io_id uuid,
    status character varying(30) DEFAULT 'Under Investigation'::character varying NOT NULL,
    priority character varying(10) DEFAULT 'Low'::character varying NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT cases_priority_check CHECK (((priority)::text = ANY ((ARRAY['Low'::character varying, 'Medium'::character varying, 'High'::character varying])::text[]))),
    CONSTRAINT cases_status_check CHECK (((status)::text = ANY ((ARRAY['Under Investigation'::character varying, 'Solved'::character varying, 'Cleared'::character varying, 'Referred'::character varying])::text[])))
);


--
-- Name: cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cases_id_seq OWNED BY public.cases.id;


--
-- Name: complainants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complainants (
    complainant_id integer NOT NULL,
    blotter_id integer,
    first_name character varying(50) NOT NULL,
    middle_name character varying(50),
    last_name character varying(50) NOT NULL,
    qualifier character varying(20),
    alias character varying(50),
    gender character varying(10) NOT NULL,
    nationality character varying(50) NOT NULL,
    contact_number character varying(15),
    region character varying(100) NOT NULL,
    district_province character varying(100) NOT NULL,
    city_municipality character varying(100) NOT NULL,
    barangay character varying(100) NOT NULL,
    house_street character varying(200) NOT NULL,
    info_obtained character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    occupation character varying(100),
    region_code character varying(20),
    province_code character varying(20),
    municipality_code character varying(20),
    barangay_code character varying(20)
);


--
-- Name: complainants_complainant_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.complainants_complainant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: complainants_complainant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.complainants_complainant_id_seq OWNED BY public.complainants.complainant_id;


--
-- Name: crime_modus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crime_modus (
    id integer NOT NULL,
    blotter_id integer,
    modus_reference_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crime_modus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crime_modus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crime_modus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crime_modus_id_seq OWNED BY public.crime_modus.id;


--
-- Name: crime_modus_reference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crime_modus_reference (
    id integer NOT NULL,
    crime_type character varying(100) NOT NULL,
    modus_name character varying(200) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    description text,
    is_active boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crime_modus_reference_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crime_modus_reference_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crime_modus_reference_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crime_modus_reference_id_seq OWNED BY public.crime_modus_reference.id;


--
-- Name: mobile_unit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mobile_unit (
    mobile_unit_id integer NOT NULL,
    mobile_unit_name character varying(50) NOT NULL,
    barangay_area character varying(500) NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mobile_unit_mobile_unit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mobile_unit_mobile_unit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mobile_unit_mobile_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mobile_unit_mobile_unit_id_seq OWNED BY public.mobile_unit.mobile_unit_id;


--
-- Name: mobile_unit_patroller; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mobile_unit_patroller (
    id integer NOT NULL,
    mobile_unit_id integer NOT NULL,
    active_patroller_id integer NOT NULL,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mobile_unit_patroller_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mobile_unit_patroller_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mobile_unit_patroller_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mobile_unit_patroller_id_seq OWNED BY public.mobile_unit_patroller.id;


--
-- Name: offenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offenses (
    offense_id integer NOT NULL,
    blotter_id integer,
    is_principal_offense boolean NOT NULL,
    offense_name character varying(100) NOT NULL,
    stage_of_felony character varying(50) NOT NULL,
    index_type character varying(20) NOT NULL,
    investigator_on_case character varying(100) NOT NULL,
    most_investigator character varying(100) NOT NULL,
    modus character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: offenses_offense_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offenses_offense_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offenses_offense_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offenses_offense_id_seq OWNED BY public.offenses.offense_id;


--
-- Name: otp_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_requests (
    email character varying(255) NOT NULL,
    otp_hash character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    request_count integer DEFAULT 1 NOT NULL,
    last_request_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: police_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.police_details (
    user_id uuid NOT NULL,
    rank character varying(100),
    mobile_patrol integer,
    department character varying(100)
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    role_id integer NOT NULL,
    role_name character varying(50) NOT NULL,
    user_type character varying(20) NOT NULL,
    CONSTRAINT roles_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['police'::character varying, 'barangay'::character varying])::text[])))
);


--
-- Name: roles_role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_role_id_seq OWNED BY public.roles.role_id;


--
-- Name: suspects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suspects (
    suspect_id integer NOT NULL,
    blotter_id integer,
    first_name character varying(50) NOT NULL,
    middle_name character varying(50),
    last_name character varying(50) NOT NULL,
    qualifier character varying(20),
    alias character varying(50),
    gender character varying(10) NOT NULL,
    birthday date,
    age integer,
    birth_place character varying(100),
    nationality character varying(50) NOT NULL,
    region character varying(100) NOT NULL,
    district_province character varying(100) NOT NULL,
    city_municipality character varying(100) NOT NULL,
    barangay character varying(100) NOT NULL,
    house_street character varying(200) NOT NULL,
    status character varying(50) NOT NULL,
    location_if_arrested character varying(200),
    degree_participation character varying(50) NOT NULL,
    relation_to_victim character varying(100),
    educational_attainment character varying(50),
    height_cm integer,
    drug_used boolean,
    motive text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    occupation character varying(100),
    region_code character varying(10),
    province_code character varying(10),
    municipality_code character varying(10),
    barangay_code character varying(10)
);


--
-- Name: suspects_suspect_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suspects_suspect_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suspects_suspect_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suspects_suspect_id_seq OWNED BY public.suspects.suspect_id;


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens (
    token_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    is_revoked boolean DEFAULT false NOT NULL,
    revoked_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_addresses (
    address_id integer NOT NULL,
    user_id uuid NOT NULL,
    region_code character varying(30) NOT NULL,
    province_code character varying(30) NOT NULL,
    municipality_code character varying(30) NOT NULL,
    barangay_code character varying(30) NOT NULL,
    address_line text
);


--
-- Name: user_addresses_address_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_addresses_address_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_addresses_address_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_addresses_address_id_seq OWNED BY public.user_addresses.address_id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    middle_name character varying(50),
    suffix character varying(10),
    phone character varying(15) NOT NULL,
    alternate_phone character varying(15),
    gender character varying(10) NOT NULL,
    date_of_birth date NOT NULL,
    role_id integer NOT NULL,
    user_type character varying(20) NOT NULL,
    profile_picture text,
    status character varying(15) DEFAULT 'unverified'::character varying NOT NULL,
    lockout_until timestamp without time zone,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    last_login timestamp without time zone,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    email_changed_at timestamp with time zone,
    password_changed_at timestamp with time zone,
    pw_change_count integer DEFAULT 0 NOT NULL,
    pw_window_start bigint,
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'deactivated'::character varying, 'locked'::character varying, 'unverified'::character varying])::text[]))),
    CONSTRAINT users_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['police'::character varying, 'barangay'::character varying])::text[])))
);


--
-- Name: active_patroller active_patroller_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_patroller ALTER COLUMN active_patroller_id SET DEFAULT nextval('public.active_patroller_active_patroller_id_seq'::regclass);


--
-- Name: barangay_map_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.barangay_map_data ALTER COLUMN id SET DEFAULT nextval('public.barangay_map_data_id_seq'::regclass);


--
-- Name: blotter_entries blotter_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blotter_entries ALTER COLUMN blotter_id SET DEFAULT nextval('public.blotter_entries_blotter_id_seq'::regclass);


--
-- Name: case_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes ALTER COLUMN id SET DEFAULT nextval('public.case_notes_id_seq'::regclass);


--
-- Name: cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases ALTER COLUMN id SET DEFAULT nextval('public.cases_id_seq'::regclass);


--
-- Name: complainants complainant_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complainants ALTER COLUMN complainant_id SET DEFAULT nextval('public.complainants_complainant_id_seq'::regclass);


--
-- Name: crime_modus id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crime_modus ALTER COLUMN id SET DEFAULT nextval('public.crime_modus_id_seq'::regclass);


--
-- Name: crime_modus_reference id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crime_modus_reference ALTER COLUMN id SET DEFAULT nextval('public.crime_modus_reference_id_seq'::regclass);


--
-- Name: mobile_unit mobile_unit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit ALTER COLUMN mobile_unit_id SET DEFAULT nextval('public.mobile_unit_mobile_unit_id_seq'::regclass);


--
-- Name: mobile_unit_patroller id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit_patroller ALTER COLUMN id SET DEFAULT nextval('public.mobile_unit_patroller_id_seq'::regclass);


--
-- Name: offenses offense_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offenses ALTER COLUMN offense_id SET DEFAULT nextval('public.offenses_offense_id_seq'::regclass);


--
-- Name: roles role_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN role_id SET DEFAULT nextval('public.roles_role_id_seq'::regclass);


--
-- Name: suspects suspect_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suspects ALTER COLUMN suspect_id SET DEFAULT nextval('public.suspects_suspect_id_seq'::regclass);


--
-- Name: user_addresses address_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses ALTER COLUMN address_id SET DEFAULT nextval('public.user_addresses_address_id_seq'::regclass);


--
-- Data for Name: active_patroller; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.active_patroller (active_patroller_id, officer_id, mobile_unit_assigned, status, last_login) FROM stdin;
18	d51e03c6-0f15-4563-ad0c-4aa26edc0f13	mb 1	Active	\N
\.


--
-- Data for Name: barangay_details; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.barangay_details (user_id, barangay_code) FROM stdin;
93dbf76c-e52f-41b3-9e2f-604b1085ea3b	042103005
9e3bc50b-1638-4a44-8b78-e7217dd12131	042103045
d72fc8a3-a824-4d26-838d-9c4891fa2268	042103001
\.


--
-- Data for Name: barangay_map_data; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.barangay_map_data (id, name_kml, name_db, centroid_lat, centroid_lng, created_at) FROM stdin;
1	Maliksi 1	MALIKSI I	14.4617990	120.9544620	2026-03-09 10:54:40.160831
2	Salinas 1	SALINAS I	14.4415590	120.9365340	2026-03-09 10:54:40.160831
3	Dulong Bayan	DULONG BAYAN	14.4481480	120.9358510	2026-03-09 10:54:40.160831
4	Habay 1	HABAY I	14.4506400	120.9437410	2026-03-09 10:54:40.160831
5	Habay 2	HABAY II	14.4428430	120.9469160	2026-03-09 10:54:40.160831
6	Panapaan 3	P.F. ESPIRITU III	14.4514370	120.9520230	2026-03-09 10:54:40.160831
7	Panapaan 1	P.F. ESPIRITU I (PANAPAAN)	14.4484330	120.9569630	2026-03-09 10:54:40.160831
8	Panapaan 5	P.F. ESPIRITU V	14.4376640	120.9515690	2026-03-09 10:54:40.160831
9	Ligas 2	LIGAS II	14.4424500	120.9692520	2026-03-09 10:54:40.160831
10	Panapaan 6	P.F. ESPIRITU VI	14.4381840	120.9590380	2026-03-09 10:54:40.160831
11	San Nicolas 1	SAN NICOLAS I	14.4370110	120.9714590	2026-03-09 10:54:40.160831
12	San Nicolas 2	SAN NICOLAS II	14.4324090	120.9761750	2026-03-09 10:54:40.160831
13	San Nicolas 3	SAN NICOLAS III	14.4220440	120.9839710	2026-03-09 10:54:40.160831
14	Bayanan	BAYANAN	14.4258820	120.9691970	2026-03-09 10:54:40.160831
15	Mambog 1	MAMBOG I	14.4228080	120.9502160	2026-03-09 10:54:40.160831
16	Mambog 3	MAMBOG III	14.4144330	120.9600310	2026-03-09 10:54:40.160831
17	Mambog 4	MAMBOG IV	14.4203800	120.9632270	2026-03-09 10:54:40.160831
18	Molino 1	MOLINO I	14.4202610	120.9735260	2026-03-09 10:54:40.160831
19	Molino 6	MOLINO VI	14.4147440	120.9838660	2026-03-09 10:54:40.160831
20	Molino 5	MOLINO V	14.3980310	120.9703050	2026-03-09 10:54:40.160831
21	Molino 2	MOLINO II	14.4100170	120.9768860	2026-03-09 10:54:40.160831
22	Molino 7	MOLINO VII	14.3940920	121.0011660	2026-03-09 10:54:40.160831
23	Molino 3	MOLINO III	14.3973310	120.9835390	2026-03-09 10:54:40.160831
24	Zapote 3	ZAPOTE III	14.4698360	120.9653010	2026-03-09 10:54:40.160831
25	Talaba 2	TALABA II	14.4649350	120.9591010	2026-03-09 10:54:40.160831
26	Queen's Row West	QUEENS ROW WEST	14.4021450	120.9869290	2026-03-09 10:54:40.160831
27	Queens's Row Central	QUEENS ROW CENTRAL	14.3965780	120.9895120	2026-03-09 10:54:40.160831
28	Queen's Row East	QUEENS ROW EAST	14.4000640	120.9934520	2026-03-09 10:54:40.160831
29	Molino 4	MOLINO IV	14.3762770	120.9892560	2026-03-09 10:54:40.160831
30	Sinbanali	SINEGUELASAN	14.4578020	120.9301390	2026-03-09 10:54:40.160831
31	Poblacion	KAINGIN (POB.)	14.4590680	120.9401770	2026-03-09 10:54:40.160831
33	Salinas 2	SALINAS II	14.4406580	120.9433620	2026-03-09 10:54:40.160831
34	Maliksi 2	MALIKSI II	14.4612630	120.9494000	2026-03-09 10:54:40.160831
35	Zapote 1	ZAPOTE I	14.4644670	120.9637340	2026-03-09 10:54:40.160831
36	Zapote 2	ZAPOTE II	14.4643930	120.9654630	2026-03-09 10:54:40.160831
37	Talaba 1	TALABA I	14.4613000	120.9577230	2026-03-09 10:54:40.160831
38	Talaba 3	TALABA III	14.4621840	120.9617830	2026-03-09 10:54:40.160831
39	Aniban 1	ANIBAN I	14.4538930	120.9650880	2026-03-09 10:54:40.160831
40	Aniban 2	ANIBAN II	14.4594460	120.9669940	2026-03-09 10:54:40.160831
41	Mambog 2	MAMBOG II	14.4258320	120.9526180	2026-03-09 10:54:40.160831
43	Ligas 1	LIGAS I	14.4515970	120.9681940	2026-03-09 10:54:40.160831
45	Panapaan 2	P.F. ESPIRITU II	14.4549230	120.9518180	2026-03-09 10:54:40.160831
46	Panapaan 4	P.F. ESPIRITU IV	14.4434600	120.9541880	2026-03-09 10:54:40.160831
32	Mabolo	MABOLO	14.4506420	120.9317440	2026-03-09 10:54:40.160831
42	Niog	NIOG	14.4469330	120.9619220	2026-03-09 10:54:40.160831
44	Real	REAL	14.4344690	120.9482030	2026-03-09 10:54:40.160831
47	Kaingin Digman	KAINGIN DIGMAN	14.4599210	120.9444200	2026-03-14 17:59:37.575586
\.


--
-- Data for Name: blotter_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.blotter_entries (blotter_id, blotter_entry_number, incident_type, cop, date_time_commission, date_time_reported, place_region, place_district_province, place_city_municipality, place_barangay, place_street, is_private_place, narrative, amount_involved, referred_by_barangay, referred_by_dilg, status, created_by, created_at, updated_at, type_of_place, is_deleted, deleted_at, lat, lng, modus, day_of_incident, month_of_incident) FROM stdin;
5	SEED-2025-0001	RAPE	PNP Bacoor	2025-08-25 08:00:00	2025-08-25 08:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	RAPE incident in MOLINO III	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 20:23:55.67447	Residential (house/condo)	f	\N	14.4047130	120.9934620	Statutory rape	Monday	August
2	2026-000002-96866	THEFT	COP Jerome	2026-03-05 17:23:00	2026-03-07 17:23:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	Mabolo	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	\N	Slediranaaaaaaaaaaaaaaaaaaaaaa	\N	f	t	Pending	\N	2026-03-07 17:24:41.468943	2026-03-08 00:56:10.345062	Vacant Lot (unused/unoccupied open area)	f	\N	\N	\N	\N	\N	\N
1	2026-000001-39677	THEFT	COP Jai	2026-03-06 16:24:00	2026-03-06 16:25:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	Daang Bukid	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	Yes	ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff	4000.00	f	f	Pending	\N	2026-03-07 16:25:19.295606	2026-03-10 15:46:52.083373	Construction/Industrial Barracks	f	\N	\N	\N	\N	\N	\N
7	SEED-2025-0003	THEFT	PNP Bacoor	2025-07-24 08:00:00	2025-07-24 08:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City	\N	THEFT incident in TALABA I	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4602800	120.9578860		Thursday	July
6	SEED-2025-0002	ROBBERY	PNP Bacoor	2025-08-08 01:00:00	2025-08-08 01:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU IV	Bacoor City	\N	ROBBERY incident in P.F. ESPIRITU IV	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4459840	120.9532930	Hold-up w/ gun	Friday	August
9	SEED-2025-0005	MURDER	PNP Bacoor	2025-06-28 03:00:00	2025-06-28 03:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City	\N	MURDER incident in MAMBOG IV	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4223780	120.9634250	Shooting	Saturday	June
10	SEED-2025-0006	MURDER	PNP Bacoor	2025-06-27 19:00:00	2025-06-27 19:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City	\N	MURDER incident in SAN NICOLAS III	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4076640	120.9905850	Shooting	Friday	June
12	SEED-2025-0008	RAPE	PNP Bacoor	2025-05-19 10:00:00	2025-05-19 10:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City	\N	RAPE incident in MOLINO II	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Parking Area (vacant lot, in bldg/structure, open parking)	f	\N	14.4098780	120.9753110	Statutory rape	Monday	May
14	SEED-2025-0010	Special Complex Crime	PNP Bacoor	2025-04-02 20:00:00	2025-04-02 20:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	Special Complex Crime incident in MOLINO III	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.3981870	120.9778820	Akyat Bahay	Wednesday	April
15	SEED-2025-0011	ROBBERY	PNP Bacoor	2025-03-03 18:00:00	2025-03-03 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	LIGAS I	Bacoor City	\N	ROBBERY incident in LIGAS I	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4530910	120.9688260	Hold-up w/ gun	Monday	March
16	SEED-2025-0012	RAPE	PNP Bacoor	2025-03-01 02:00:00	2025-03-01 02:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SALINAS I	Bacoor City	\N	RAPE incident in SALINAS I	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4406230	120.9354250	Statutory rape	Saturday	March
17	SEED-2025-0013	Special Complex Crime	PNP Bacoor	2025-02-10 19:00:00	2025-02-10 19:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	Special Complex Crime incident in MOLINO III	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.3981970	120.9830250	Akyat Bahay	Monday	February
18	SEED-2025-0014	RAPE	PNP Bacoor	2025-01-29 04:00:00	2025-01-29 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS II	Bacoor City	\N	RAPE incident in SAN NICOLAS II	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4311060	120.9727550	Statutory rape	Wednesday	January
19	SEED-2025-0015	THEFT	PNP Bacoor	2025-01-25 08:00:00	2025-01-25 08:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City	\N	THEFT incident in ZAPOTE III	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Onboard a vehicle (riding in/on)	f	\N	14.4603220	120.9583130	Snatching	Saturday	January
20	SEED-2025-0016	ROBBERY	PNP Bacoor	2025-01-22 00:00:00	2025-01-22 00:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	LIGAS II	Bacoor City	\N	ROBBERY incident in LIGAS II	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4457660	120.9659500	Hold-up w/ gun	Wednesday	January
21	SEED-2025-0017	RAPE	PNP Bacoor	2025-01-18 16:00:00	2025-01-18 16:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO I	Bacoor City	\N	RAPE incident in MOLINO I	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4145640	120.9720080		Saturday	January
23	SEED-2025-0019	RAPE	PNP Bacoor	2025-08-30 23:00:00	2025-08-30 23:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	RAPE incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4478440	120.9507900	Statutory rape	Saturday	August
24	SEED-2025-0020	THEFT	PNP Bacoor	2025-08-29 12:00:00	2025-08-29 12:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	THEFT incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4441970	120.9507220	Salisi	Friday	August
28	SEED-2025-0024	HOMICIDE	PNP Bacoor	2025-08-26 14:00:00	2025-08-26 14:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City	\N	HOMICIDE incident in ZAPOTE III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4692140	120.9626080	Stabbing	Tuesday	August
29	SEED-2025-0025	THEFT	PNP Bacoor	2025-08-24 19:00:00	2025-08-24 19:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City	\N	THEFT incident in QUEENS ROW WEST	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4001410	120.9861680	Committed by an employee (commercial/store/shop)	Sunday	August
30	SEED-2025-0026	PHYSICAL INJURIES	PNP Bacoor	2025-08-23 22:00:00	2025-08-23 22:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City	\N	PHYSICAL INJURIES incident in SAN NICOLAS III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4076640	120.9905850	Punching	Saturday	August
31	SEED-2025-0027	THEFT	PNP Bacoor	2025-08-21 17:00:00	2025-08-21 17:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	THEFT incident in MOLINO III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4015960	120.9770660	Committed by an employee (commercial/store/shop)	Thursday	August
33	SEED-2025-0029	THEFT	PNP Bacoor	2025-08-18 13:00:00	2025-08-18 13:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City	\N	THEFT incident in MOLINO II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4096180	120.9754330	Shoplifting	Monday	August
32	SEED-2025-0028	PHYSICAL INJURIES	PNP Bacoor	2025-08-19 12:00:00	2025-08-19 12:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	REAL	Bacoor City	\N	PHYSICAL INJURIES incident in REAL I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4349300	120.9468540	Mauling	Tuesday	August
13	SEED-2025-0009	MURDER	PNP Bacoor	2025-04-27 18:00:00	2025-04-27 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City	\N	MURDER incident in HABAY I	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Onboard a vehicle (riding in/on)	f	\N	14.4503480	120.9427800	Shooting	Sunday	April
11	SEED-2025-0007	MURDER	PNP Bacoor	2025-06-06 01:00:00	2025-06-06 01:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City	\N	MURDER incident in SAN NICOLAS III	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4125690	120.9914470	Hacking	Friday	June
27	SEED-2025-0023	RAPE	PNP Bacoor	2025-08-27 18:00:00	2025-08-27 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW EAST	Bacoor City	\N	RAPE incident in QUEENS ROW EAST	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	t	2026-03-15 22:05:59.157896	14.3980210	120.9932250	Fetishism/Object Rape	Wednesday	August
22	SEED-2025-0018	MURDER	PNP Bacoor	2025-08-31 03:00:00	2025-08-31 03:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City	\N	MURDER incident in MOLINO V	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	t	2026-03-15 22:06:04.762944	14.3964000	120.9707030	Shooting	Sunday	August
8	SEED-2025-0004	ROBBERY	PNP Bacoor	2025-07-21 04:00:00	2025-07-21 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	ROBBERY incident in MOLINO III	\N	f	f	Cleared	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	t	2026-03-15 22:13:41.099225	14.4050870	120.9800720	Baklas bubong/dingding	Monday	July
34	SEED-2025-0030	THEFT	PNP Bacoor	2025-08-14 01:00:00	2025-08-14 01:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City	\N	THEFT incident in P.F. ESPIRITU III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	School (Grade/High School/College/University)	f	\N	14.4515120	120.9555210	Salisi	Thursday	August
35	SEED-2025-0031	THEFT	PNP Bacoor	2025-08-13 07:00:00	2025-08-13 07:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU V	Bacoor City	\N	THEFT incident in P.F. ESPIRITU V	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Abandoned Structure (house, bldg, apartment/cond)	f	\N	14.4372150	120.9510570	Pushing	Wednesday	August
36	SEED-2025-0032	ROBBERY	PNP Bacoor	2025-08-13 23:00:00	2025-08-13 23:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City	\N	ROBBERY incident in BAYANAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4242480	120.9676280		Wednesday	August
37	SEED-2025-0033	ROBBERY	PNP Bacoor	2025-08-10 13:00:00	2025-08-10 13:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City	\N	ROBBERY incident in ZAPOTE II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4638540	120.9659500	Akyat Bahay	Sunday	August
38	SEED-2025-0034	MURDER	PNP Bacoor	2025-08-09 18:00:00	2025-08-09 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City	\N	MURDER incident in MOLINO II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Vacant Lot (unused/unoccupied open area)	f	\N	14.4059600	120.9846880	Shooting	Saturday	August
39	SEED-2025-0035	THEFT	PNP Bacoor	2025-08-08 09:00:00	2025-08-08 09:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City	\N	THEFT incident in MAMBOG IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4226270	120.9616170	Committed by an employee (commercial/store/shop)	Friday	August
40	SEED-2025-0036	THEFT	PNP Bacoor	2025-08-07 04:00:00	2025-08-07 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City	\N	THEFT incident in QUEENS ROW WEST	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Parking Area (vacant lot, in bldg/structure, open parking)	f	\N	14.3989770	120.9868090	Salisi	Thursday	August
41	SEED-2025-0037	THEFT	PNP Bacoor	2025-08-06 20:00:00	2025-08-06 20:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MALIKSI I	Bacoor City	\N	THEFT incident in MALIKSI I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4603220	120.9524380	Shoplifting	Wednesday	August
42	SEED-2025-0038	THEFT	PNP Bacoor	2025-01-04 01:00:00	2025-01-04 01:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	BANALO	Bacoor City	\N	THEFT incident in BANALO	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4577450	120.9322200	Salisi	Saturday	January
43	SEED-2025-0039	THEFT	PNP Bacoor	2025-08-05 08:00:00	2025-08-05 08:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA II	Bacoor City	\N	THEFT incident in TALABA II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4637290	120.9595180	Salisi	Tuesday	August
44	SEED-2025-0040	THEFT	PNP Bacoor	2025-08-05 17:00:00	2025-08-05 17:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU I (PANAPAAN)	Bacoor City	\N	THEFT incident in P.F. ESPIRITU I (PANAPAAN)	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4489770	120.9546660	Salisi	Tuesday	August
45	SEED-2025-0041	THEFT	PNP Bacoor	2025-08-05 14:00:00	2025-08-05 14:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	THEFT incident in MOLINO IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Parking Area (vacant lot, in bldg/structure, open parking)	f	\N	14.3839290	120.9762730	Salisi	Tuesday	August
46	SEED-2025-0042	PHYSICAL INJURIES	PNP Bacoor	2025-08-04 17:00:00	2025-08-04 17:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City	\N	PHYSICAL INJURIES incident in TALABA I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4602800	120.9580990		Monday	August
47	SEED-2025-0043	ROBBERY	PNP Bacoor	2025-08-04 08:00:00	2025-08-04 08:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City	\N	ROBBERY incident in QUEENS ROW WEST	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.3999740	120.9863820	Pushing	Monday	August
48	SEED-2025-0044	THEFT	PNP Bacoor	2025-08-04 23:00:00	2025-08-04 23:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU I (PANAPAAN)	Bacoor City	\N	THEFT incident in P.F. ESPIRITU I (PANAPAAN)	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4485610	120.9554820	Salisi	Monday	August
49	SEED-2025-0045	THEFT	PNP Bacoor	2025-08-03 00:00:00	2025-08-03 00:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU VI	Bacoor City	\N	THEFT incident in P.F. ESPIRITU VI	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4370080	120.9601140		Sunday	August
50	SEED-2025-0046	PHYSICAL INJURIES	PNP Bacoor	2025-08-03 20:00:00	2025-08-03 20:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	PHYSICAL INJURIES incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4437820	120.9482500	Mauling	Sunday	August
51	SEED-2025-0047	PHYSICAL INJURIES	PNP Bacoor	2025-08-02 21:00:00	2025-08-02 21:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SINEGUELASAN	Bacoor City	\N	PHYSICAL INJURIES incident in SINEGUELASAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4576620	120.9324340	Stoning/thrown object	Saturday	August
52	SEED-2025-0048	ROBBERY	PNP Bacoor	2025-08-01 21:00:00	2025-08-01 21:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City	\N	ROBBERY incident in ZAPOTE III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4690070	120.9628220	Hold-up w/ sharp object	Friday	August
53	SEED-2025-0049	THEFT	PNP Bacoor	2025-07-30 10:00:00	2025-07-30 10:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City	\N	THEFT incident in ZAPOTE II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4626900	120.9648360	Salisi	Wednesday	July
54	SEED-2025-0050	THEFT	PNP Bacoor	2025-07-27 20:00:00	2025-07-27 20:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA IV	Bacoor City	\N	THEFT incident in TALABA IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4613290	120.9597320	Snatching	Sunday	July
55	SEED-2025-0051	THEFT	PNP Bacoor	2025-07-27 16:00:00	2025-07-27 16:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City	\N	THEFT incident in MOLINO II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4096180	120.9759520	Salisi (akyat bahay)	Sunday	July
57	SEED-2025-0053	THEFT	PNP Bacoor	2025-07-27 01:00:00	2025-07-27 01:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City	\N	THEFT incident in HABAY I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4489770	120.9432070	Cable/electric meter	Sunday	July
58	SEED-2025-0054	ROBBERY	PNP Bacoor	2025-07-25 04:00:00	2025-07-25 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City	\N	ROBBERY incident in ZAPOTE I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4655580	120.9680560	Crowbar/destroying lock	Friday	July
59	SEED-2025-0055	PHYSICAL INJURIES	PNP Bacoor	2025-07-14 07:00:00	2025-07-14 07:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City	\N	PHYSICAL INJURIES incident in HABAY I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4472730	120.9435960	Mauling	Monday	July
60	SEED-2025-0056	THEFT	PNP Bacoor	2025-07-10 17:00:00	2025-07-10 17:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City	\N	THEFT incident in BAYANAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4240820	120.9669420	Shoplifting	Thursday	July
61	SEED-2025-0057	ROBBERY	PNP Bacoor	2025-07-10 01:00:00	2025-07-10 01:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City	\N	ROBBERY incident in HABAY I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	School (Grade/High School/College/University)	f	\N	14.4475220	120.9420930	Baklas bubong/dingding	Thursday	July
62	SEED-2025-0058	RAPE	PNP Bacoor	2025-07-06 12:00:00	2025-07-06 12:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	RAPE incident in MOLINO IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.3690050	120.9952620	Statutory rape	Sunday	July
63	SEED-2025-0059	THEFT	PNP Bacoor	2025-07-05 07:00:00	2025-07-05 07:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City	\N	THEFT incident in SAN NICOLAS III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Construction/Industrial Barracks	f	\N	14.4078720	120.9907990	Committed by an employee (commercial/store/shop)	Saturday	July
64	SEED-2025-0060	RAPE	PNP Bacoor	2025-06-29 15:00:00	2025-06-29 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City	\N	RAPE incident in DULONG BAYAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4480210	120.9362870	Fetishism/Object Rape	Sunday	June
65	SEED-2025-0061	RAPE	PNP Bacoor	2025-06-29 08:00:00	2025-06-29 08:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	RAPE incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4443640	120.9480740	Force, Threat and Intimidation	Sunday	June
66	SEED-2025-0062	RAPE	PNP Bacoor	2025-01-06 15:00:00	2025-01-06 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City	\N	RAPE incident in ZAPOTE III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4689240	120.9641950	Statutory rape	Monday	January
67	SEED-2025-0063	THEFT	PNP Bacoor	2025-06-27 09:00:00	2025-06-27 09:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City	\N	THEFT incident in ZAPOTE I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4657650	120.9682690	Shoplifting	Friday	June
68	SEED-2025-0064	MURDER	PNP Bacoor	2025-06-26 18:00:00	2025-06-26 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City	\N	MURDER incident in ZAPOTE II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Along the street	f	\N	14.4627320	120.9655230	Shooting	Thursday	June
69	SEED-2025-0065	THEFT	PNP Bacoor	2025-06-24 21:00:00	2025-06-24 21:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City	\N	THEFT incident in MAMBOG IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Parking Area (vacant lot, in bldg/structure, open parking)	f	\N	14.4226690	120.9614870	Vehicle Parts & Accessories	Tuesday	June
70	SEED-2025-0066	RAPE	PNP Bacoor	2025-06-24 02:00:00	2025-06-24 02:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VII	Bacoor City	\N	RAPE incident in MOLINO VII	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.3954440	121.0001370	Statutory rape	Tuesday	June
71	SEED-2025-0067	THEFT	PNP Bacoor	2025-06-20 17:00:00	2025-06-20 17:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	THEFT incident in MOLINO IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.3843450	120.9771580	Pick-Pocketing	Friday	June
72	SEED-2025-0068	MURDER	PNP Bacoor	2025-06-08 13:00:00	2025-06-08 13:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VII	Bacoor City	\N	MURDER incident in MOLINO VII	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4000990	120.9990390	Shooting	Sunday	June
73	SEED-2025-0069	ROBBERY	PNP Bacoor	2025-06-06 07:00:00	2025-06-06 07:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW CENTRAL	Bacoor City	\N	ROBBERY incident in QUEENS ROW CENTRAL	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.3962750	120.9878010	Crowbar/destroying lock	Friday	June
74	SEED-2025-0070	RAPE	PNP Bacoor	2025-06-02 15:00:00	2025-06-02 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City	\N	RAPE incident in MAMBOG IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4233750	120.9611430	Statutory rape	Monday	June
75	SEED-2025-0071	MURDER	PNP Bacoor	2025-05-26 04:00:00	2025-05-26 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City	\N	MURDER incident in MOLINO II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Vacant Lot (unused/unoccupied open area)	f	\N	14.4096590	120.9765090	Stabbing	Monday	May
76	SEED-2025-0072	THEFT	PNP Bacoor	2025-05-25 22:00:00	2025-05-25 22:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG I	Bacoor City	\N	THEFT incident in MAMBOG I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Vacant Lot (unused/unoccupied open area)	f	\N	14.4246640	120.9490890	Snatching	Sunday	May
78	SEED-2025-0074	THEFT	PNP Bacoor	2025-05-20 19:00:00	2025-05-20 19:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City	\N	THEFT incident in BAYANAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4275940	120.9647290	Shoplifting	Tuesday	May
79	SEED-2025-0075	THEFT	PNP Bacoor	2025-05-19 10:00:00	2025-05-19 10:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City	\N	THEFT incident in ZAPOTE I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4628150	120.9634250	Shoplifting	Monday	May
80	SEED-2025-0076	THEFT	PNP Bacoor	2025-05-15 11:00:00	2025-05-15 11:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	THEFT incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4443640	120.9507600	Shoplifting	Thursday	May
81	SEED-2025-0077	RAPE	PNP Bacoor	2025-05-09 05:00:00	2025-05-09 05:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	RAPE incident in MOLINO IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Vacant Lot (unused/unoccupied open area)	f	\N	14.3771940	120.9789960	Force, Threat and Intimidation	Friday	May
82	SEED-2025-0078	THEFT	PNP Bacoor	2025-05-02 12:00:00	2025-05-02 12:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City	\N	THEFT incident in DULONG BAYAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4491010	120.9361270	Shoplifting	Friday	May
83	SEED-2025-0079	PHYSICAL INJURIES	PNP Bacoor	2025-04-26 14:00:00	2025-04-26 14:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City	\N	PHYSICAL INJURIES incident in SAN NICOLAS III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	River/Lake	f	\N	14.4075390	120.9905850	Hitting with hard object	Saturday	April
84	SEED-2025-0080	ROBBERY	PNP Bacoor	2025-04-18 04:00:00	2025-04-18 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SINEGUELASAN	Bacoor City	\N	ROBBERY incident in SINEGUELASAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	School (Grade/High School/College/University)	f	\N	14.4578700	120.9325640	Akyat Bahay	Friday	April
85	SEED-2025-0081	ROBBERY	PNP Bacoor	2025-04-17 03:00:00	2025-04-17 03:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO I	Bacoor City	\N	ROBBERY incident in MOLINO I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4213390	120.9750060	Crowbar/destroying lock	Thursday	April
86	SEED-2025-0082	RAPE	PNP Bacoor	2025-04-12 02:00:00	2025-04-12 02:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	RAPE incident in MOLINO III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4108540	120.9752350	Force, Threat and Intimidation	Saturday	April
87	SEED-2025-0083	THEFT	PNP Bacoor	2025-04-07 12:00:00	2025-04-07 12:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	THEFT incident in MOLINO III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.3984360	120.9771120	Salisi	Monday	April
88	SEED-2025-0084	THEFT	PNP Bacoor	2025-04-07 15:00:00	2025-04-07 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS I	Bacoor City	\N	THEFT incident in SAN NICOLAS I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4383790	120.9732890	Committed by an employee (commercial/store/shop)	Monday	April
89	SEED-2025-0085	ROBBERY	PNP Bacoor	2025-04-07 19:00:00	2025-04-07 19:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City	\N	ROBBERY incident in HABAY I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Transportation Terminals (Tricycle, Jeep, FX, Bus, Train Station)	f	\N	14.4473140	120.9434200	Extortion	Monday	April
90	SEED-2025-0086	ROBBERY	PNP Bacoor	2025-04-04 23:00:00	2025-04-04 23:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VI	Bacoor City	\N	ROBBERY incident in MOLINO VI	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Transportation Terminals (Tricycle, Jeep, FX, Bus, Train Station)	f	\N	14.4141900	120.9820480	Hold-up w/ sharp object	Friday	April
91	SEED-2025-0087	THEFT	PNP Bacoor	2025-04-03 21:00:00	2025-04-03 21:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG II	Bacoor City	\N	THEFT incident in NIOG II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4517190	120.9600300	Salisi	Thursday	April
92	SEED-2025-0088	HOMICIDE	PNP Bacoor	2025-04-01 20:00:00	2025-04-01 20:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG III	Bacoor City	\N	HOMICIDE incident in NIOG III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Construction/Industrial Barracks	f	\N	14.4511380	120.9624790	Stabbing	Tuesday	April
93	SEED-2025-0089	THEFT	PNP Bacoor	2025-04-01 05:00:00	2025-04-01 05:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City	\N	THEFT incident in ZAPOTE III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Parking Area (vacant lot, in bldg/structure, open parking)	f	\N	14.4683420	120.9637600	Salisi	Tuesday	April
94	SEED-2025-0090	THEFT	PNP Bacoor	2025-03-30 22:00:00	2025-03-30 22:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU IV	Bacoor City	\N	THEFT incident in P.F. ESPIRITU IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Transportation Terminals (Tricycle, Jeep, FX, Bus, Train Station)	f	\N	14.4433660	120.9521790	Pick-Pocketing	Sunday	March
95	SEED-2025-0091	THEFT	PNP Bacoor	2025-03-27 06:00:00	2025-03-27 06:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	THEFT incident in MOLINO III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.3978960	120.9774090	Cable/electric meter	Thursday	March
96	SEED-2025-0092	THEFT	PNP Bacoor	2025-03-22 17:00:00	2025-03-22 17:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ANIBAN I	Bacoor City	\N	THEFT incident in ANIBAN I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4612000	120.9632110	Shoplifting	Saturday	March
97	SEED-2025-0093	THEFT	PNP Bacoor	2025-03-17 06:00:00	2025-03-17 06:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ANIBAN I	Bacoor City	\N	THEFT incident in ANIBAN I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4553350	120.9644090	Akyat Bahay	Monday	March
99	SEED-2025-0095	THEFT	PNP Bacoor	2025-03-15 05:00:00	2025-03-15 05:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA II	Bacoor City	\N	THEFT incident in TALABA II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4636050	120.9593660	Salisi (akyat bahay)	Saturday	March
100	SEED-2025-0096	PHYSICAL INJURIES	PNP Bacoor	2025-03-14 23:00:00	2025-03-14 23:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City	\N	PHYSICAL INJURIES incident in DULONG BAYAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Onboard a vehicle (riding in/on)	f	\N	14.4489350	120.9354860	Hitting with hard object	Friday	March
103	SEED-2025-0099	RAPE	PNP Bacoor	2025-01-08 09:00:00	2025-01-08 09:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City	\N	RAPE incident in P.F. ESPIRITU III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4507220	120.9545590	Force, Threat and Intimidation	Wednesday	January
104	SEED-2025-0100	THEFT	PNP Bacoor	2025-03-10 03:00:00	2025-03-10 03:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City	\N	THEFT incident in TALABA I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Transportation Terminals (Tricycle, Jeep, FX, Bus, Train Station)	f	\N	14.4604880	120.9596410	Snatching	Monday	March
105	SEED-2025-0101	ROBBERY	PNP Bacoor	2025-03-08 04:00:00	2025-03-08 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City	\N	ROBBERY incident in P.F. ESPIRITU III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Vacant Lot (unused/unoccupied open area)	f	\N	14.4511790	120.9549640	Hold-up w/ sharp object	Saturday	March
106	SEED-2025-0102	THEFT	PNP Bacoor	2025-03-06 21:00:00	2025-03-06 21:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	THEFT incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4392880	120.9491120	Committed by an employee (commercial/store/shop)	Thursday	March
107	SEED-2025-0103	THEFT	PNP Bacoor	2025-02-28 18:00:00	2025-02-28 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	THEFT incident in MOLINO IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.3837210	120.9773250	Shoplifting	Friday	February
109	SEED-2025-0105	PHYSICAL INJURIES	PNP Bacoor	2025-02-16 00:00:00	2025-02-16 00:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City	\N	PHYSICAL INJURIES incident in P.F. ESPIRITU III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4513040	120.9545820		Sunday	February
110	SEED-2025-0106	RAPE	PNP Bacoor	2025-02-14 03:00:00	2025-02-14 03:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City	\N	RAPE incident in BAYANAN	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Along the street	f	\N	14.4253910	120.9748610	Force, Threat and Intimidation	Friday	February
111	SEED-2025-0107	THEFT	PNP Bacoor	2025-02-10 05:00:00	2025-02-10 05:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA VI	Bacoor City	\N	THEFT incident in TALABA VI	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352		f	\N	14.4663160	120.9628830	Salisi (establishment)	Monday	February
98	SEED-2025-0094	ROBBERY	PNP Bacoor	2025-03-17 02:00:00	2025-03-17 02:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MABOLO	Bacoor City	\N	ROBBERY incident in MABOLO I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Along the street	f	\N	14.4503690	120.9281230	Hold-up w/ sharp object	Monday	March
112	SEED-2025-0108	THEFT	PNP Bacoor	2025-02-07 16:00:00	2025-02-07 16:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	THEFT incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4445300	120.9499050	Committed by an employee (commercial/store/shop)	Friday	February
113	SEED-2025-0109	ROBBERY	PNP Bacoor	2025-02-04 10:00:00	2025-02-04 10:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	ROBBERY incident in MOLINO IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.3766120	120.9781420	Hold-up w/ sharp object	Tuesday	February
114	SEED-2025-0110	THEFT	PNP Bacoor	2025-02-03 22:00:00	2025-02-03 22:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VI	Bacoor City	\N	THEFT incident in MOLINO VI	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Transportation Terminals (Tricycle, Jeep, FX, Bus, Train Station)	f	\N	14.4140240	120.9809720	Snatching	Monday	February
115	SEED-2025-0111	ROBBERY	PNP Bacoor	2025-01-25 06:00:00	2025-01-25 06:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City	\N	ROBBERY incident in MOLINO II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4053980	120.9852290	Hold-up w/ gun	Saturday	January
116	SEED-2025-0112	RAPE	PNP Bacoor	2025-01-21 16:00:00	2025-01-21 16:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MALIKSI II	Bacoor City	\N	RAPE incident in MALIKSI II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	River/Lake	f	\N	14.4597400	120.9500730	Force, Threat and Intimidation	Tuesday	January
117	SEED-2025-0113	THEFT	PNP Bacoor	2025-01-21 13:00:00	2025-01-21 13:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City	\N	THEFT incident in MOLINO V	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.3964310	120.9711000	Committed by an employee (commercial/store/shop)	Tuesday	January
118	SEED-2025-0114	ROBBERY	PNP Bacoor	2025-01-17 15:00:00	2025-01-17 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS II	Bacoor City	\N	ROBBERY incident in SAN NICOLAS II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Parking Area (vacant lot, in bldg/structure, open parking)	f	\N	14.4364670	120.9693450	Hold-up w/ sharp object	Friday	January
119	SEED-2025-0115	ROBBERY	PNP Bacoor	2025-01-15 07:00:00	2025-01-15 07:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City	\N	ROBBERY incident in MOLINO III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.3929700	120.9775540	Bolt cutter	Wednesday	January
120	SEED-2025-0116	MURDER	PNP Bacoor	2025-01-12 15:00:00	2025-01-12 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City	\N	MURDER incident in SAN NICOLAS III	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Residential (house/condo)	f	\N	14.4078300	120.9905400	Stabbing	Sunday	January
121	SEED-2025-0117	THEFT	PNP Bacoor	2025-01-11 18:00:00	2025-01-11 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City	\N	THEFT incident in HABAY II	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4444880	120.9508440	Committed by an employee (commercial/store/shop)	Saturday	January
122	SEED-2025-0118	THEFT	PNP Bacoor	2025-09-03 14:00:00	2025-09-03 14:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	THEFT incident in MOLINO IV	\N	f	f	Under Investigation	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.3716240	120.9799880	Shoplifting	Wednesday	September
108	SEED-2025-0104	THEFT	PNP Bacoor	2025-02-21 18:00:00	2025-02-21 18:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City	\N	THEFT incident in MOLINO IV	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 20:24:47.493024	Commercial/Business Establishment	f	\N	14.3838560	120.9782940	Salisi	Friday	February
123	2026-000121-87633	THEFT	COP Jero	2026-03-03 19:35:00	2026-03-09 19:35:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	Mabolo	ffffffffffffffff	\N	fffffffffffffffffffffffffffffffffffffffffffffffffffff	\N	f	f	Pending	\N	2026-03-09 19:35:49.538296	2026-03-14 22:10:36.311474	Recreational Place (resorts/parks)	f	\N	14.4378060	120.9618290	\N	\N	\N
124	2026-000122-54684	CARNAPPING - MV	COP Jero	2026-03-03 13:21:00	2026-03-10 13:21:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	ANIBAN I	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	\N	rehhhhhhhhhhhhhhhhhhhhhhhh	\N	f	f	Referred to Case	\N	2026-03-10 13:22:08.808032	2026-03-14 20:58:09.072312	Recreational Place (resorts/parks)	t	2026-03-14 21:00:12.460205	14.4557140	120.9648480	\N	\N	\N
25	SEED-2025-0021	CARNAPPING - MC	PNP Bacoor	2025-08-28 15:00:00	2025-08-28 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW EAST	Bacoor City	\N	NEW ANTI-CARNAPPING ACT OF 2016 - MC incident in QUEENS ROW EAST	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Parking Area (vacant lot, in bldg/structure, open parking)	f	\N	14.3979380	120.9936750	Stolen While Parked Unattended (SWPU)	Thursday	August
26	SEED-2025-0022	CARNAPPING - MC	PNP Bacoor	2025-08-27 05:00:00	2025-08-27 05:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City	\N	NEW ANTI-CARNAPPING ACT OF 2016 - MC incident in QUEENS ROW WEST	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Along the street	f	\N	14.3988940	120.9866790	Stolen While Parked Unattended (SWPU)	Wednesday	August
56	SEED-2025-0052	CARNAPPING - MC	PNP Bacoor	2025-07-27 03:00:00	2025-07-27 03:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City	\N	NEW ANTI-CARNAPPING ACT OF 2016 - MC incident in MOLINO V	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Along the street	f	\N	14.3966490	120.9726490	Stolen While Parked Unattended (SWPU)	Sunday	July
101	SEED-2025-0097	THEFT	PNP Bacoor	2025-03-13 17:00:00	2025-03-13 17:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG	Bacoor City	\N	THEFT incident in NIOG I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Commercial/Business Establishment	f	\N	14.4551690	120.9578020	Shoplifting	Thursday	March
125	2026-000005-81698	Special Complex Crime	COP Jero	2026-03-15 13:39:00	2026-03-15 13:39:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	MALIKSI I	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	\N	ffffffffffffffffffffffffffffffffff	\N	f	f	Pending	\N	2026-03-15 13:41:06.97521	2026-03-15 13:42:29.536826	Residential (house/condo)	f	\N	14.4643680	120.9528060	\N	\N	\N
102	SEED-2025-0098	THEFT	PNP Bacoor	2025-03-13 12:00:00	2025-03-13 12:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG	Bacoor City	\N	THEFT incident in NIOG I	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-09 10:58:45.65352	Transportation Terminals (Tricycle, Jeep, FX, Bus, Train Station)	f	\N	14.4551690	120.9575040	Bundol	Thursday	March
77	SEED-2025-0073	RAPE	PNP Bacoor	2025-05-24 04:00:00	2025-05-24 04:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	KAINGIN (POB.)	Bacoor City	\N	RAPE incident in KAINGIN (POB.)	\N	f	f	Solved	\N	2026-03-09 10:58:45.65352	2026-03-15 13:38:17.893595	Residential (house/condo)	f	\N	14.4592950	120.9408100	Statutory rape	Saturday	May
126	2026-000006-99534	Theft	COP Jerome	2026-03-05 15:00:00	2026-03-15 15:00:00	Region IV-A (CALABARZON)	Cavite	Bacoor City	KAINGIN (POB.)	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	\N	dffffffffffffffffffffffffffffffffffff	\N	f	f	Referred to Case	\N	2026-03-15 15:01:42.573657	2026-03-15 15:01:42.573657	Recreational Place (resorts/parks)	f	\N	14.4623510	120.9397870	\N	\N	\N
\.


--
-- Data for Name: case_notes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.case_notes (id, case_id, note, added_by_id, created_at) FROM stdin;
1	1	hihihih	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-08 15:30:24.537476
2	1	rahhh	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-08 15:30:47.294742
3	1	hiiii	d51e03c6-0f15-4563-ad0c-4aa26edc0f13	2026-03-08 16:29:57.114667
\.


--
-- Data for Name: cases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cases (id, blotter_id, case_number, assigned_io_id, status, priority, created_by, created_at, updated_at) FROM stdin;
5	20	CASE-2026-0005	4296ae68-e253-4352-9b62-1e3768844ba3	Under Investigation	Low	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-10 20:51:52.787014	2026-03-14 17:19:51.115873
6	124	CASE-2026-0006	4296ae68-e253-4352-9b62-1e3768844ba3	Referred	Medium	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-13 00:26:12.95636	2026-03-14 17:20:04.543816
7	126	CASE-2026-0007	\N	Referred	Low	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-15 15:04:16.779695	2026-03-15 15:04:41.392265
1	2	CASE-2026-0001	d51e03c6-0f15-4563-ad0c-4aa26edc0f13	Referred	Medium	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-08 15:15:04.689565	2026-03-08 16:37:20.24167
2	1	CASE-2026-0002	4296ae68-e253-4352-9b62-1e3768844ba3	Under Investigation	High	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-08 15:32:02.052306	2026-03-08 17:06:05.796995
3	12	CASE-2026-0003	4296ae68-e253-4352-9b62-1e3768844ba3	Under Investigation	Low	0b74f1c5-439e-4f8f-a217-669eb9be21d7	2026-03-09 21:35:09.28006	2026-03-10 12:06:25.167884
4	123	CASE-2026-0004	4296ae68-e253-4352-9b62-1e3768844ba3	Cleared	Low	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	2026-03-10 12:07:34.911341	2026-03-10 20:44:01.259804
\.


--
-- Data for Name: complainants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.complainants (complainant_id, blotter_id, first_name, middle_name, last_name, qualifier, alias, gender, nationality, contact_number, region, district_province, city_municipality, barangay, house_street, info_obtained, created_at, occupation, region_code, province_code, municipality_code, barangay_code) FROM stdin;
8	2	Shanna	\N	Salitorno	\N	\N	Male	FILIPINO	\N	NCR	Cavite	Dasmariñas	Fatima 1-k	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	Online	2026-03-08 00:56:10.345062	Student	\N	\N	\N	\N
10	106	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
11	120	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
12	119	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
13	101	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
14	20	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	LIGAS II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
15	82	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
16	25	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW EAST	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
17	26	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
18	27	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW EAST	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
19	93	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
20	11	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
21	39	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
22	17	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
23	66	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
24	89	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
25	33	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
26	109	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
27	57	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
28	31	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
29	34	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
30	12	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
31	10	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
32	18	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
33	98	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MABOLO I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
34	64	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
35	104	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
36	102	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
37	71	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
38	72	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VII	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
39	47	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
40	46	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
41	83	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
42	15	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	LIGAS I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
44	73	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW CENTRAL	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
45	56	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
46	40	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
47	13	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
48	91	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
49	21	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
51	112	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
52	96	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ANIBAN I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
53	107	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
55	19	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
56	65	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
57	52	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
58	37	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
59	85	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
60	32	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	REAL I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
61	78	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
62	100	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
63	113	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
64	24	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
65	55	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
66	68	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
67	38	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
68	8	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
69	80	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
70	110	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
71	99	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
72	48	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU I (PANAPAAN)	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
73	28	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
74	94	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
75	30	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
76	95	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
77	122	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
78	62	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
79	117	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
80	97	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ANIBAN I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
81	114	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VI	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
82	67	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
83	50	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
84	51	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SINEGUELASAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
85	76	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
86	69	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
87	81	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
88	79	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
89	42	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	BANALO	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
90	90	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VI	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
91	59	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
92	116	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MALIKSI II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
93	84	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SINEGUELASAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
94	74	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
95	6	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
96	29	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
97	41	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MALIKSI I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
98	16	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SALINAS I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
99	54	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
100	103	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
101	115	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
102	36	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
103	53	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
104	92	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
105	23	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
106	44	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU I (PANAPAAN)	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
107	58	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
108	111	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA VI	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
109	86	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
110	49	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU VI	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
111	22	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
112	70	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VII	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
113	45	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
114	60	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
115	105	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
116	75	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
117	43	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
118	61	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
119	87	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
120	14	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
121	121	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
122	35	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU V	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
123	63	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
124	9	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
125	118	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS II	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
126	88	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
127	7	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City Cavite	PERSONAL	2026-03-09 12:20:07.400396	\N	\N	\N	\N	\N
128	5	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Region I - Ilocos Region	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	PERSONAL	2026-03-09 20:23:55.67447	\N	\N	\N	\N	\N
129	108	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	NCR	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	PERSONAL	2026-03-09 20:24:47.493024	\N	\N	\N	\N	\N
136	1	Jerome	\N	Gopela	\N	\N	Male	FILIPINO	\N	NCR	Cavite	Dasmariñas	Fatima 1-k	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	Walk-in	2026-03-10 15:46:52.083373	\N	\N	\N	\N	\N
149	124	Jerome	\N	Gopela	\N	\N	Male	FILIPINO	\N	Bicol Region	Camarines Sur	Balatan	Camangahan	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	PERSONAL	2026-03-14 20:58:09.072312	\N	050000000	051700000	051702000	051702004
150	123	Jerome	\N	Gopela	\N	\N	Male	FILIPINO	\N	Bicol Region	Catanduanes	Bato	Batalay	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	PERSONAL	2026-03-14 22:10:36.311474	\N	050000000	052000000	052003000	052003004
152	77	Unknown	\N	Complainant	\N	\N	Male	FILIPINO	\N	Bicol Region	Camarines Norte	Capalonga	Binawangan	Bacoor City Cavite	PERSONAL	2026-03-15 13:38:17.893595	\N	050000000	051600000	051602000	051602002
155	125	Jerome	\N	Gopela	\N	\N	Male	FILIPINO	\N	Central Visayas	Bohol	Catigbian	Kang-iras	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	PERSONAL	2026-03-15 13:42:29.536826	\N	070000000	071200000	071213000	071213009
156	126	Jerome	Mayuga	Gopela	\N	\N	Male	FILIPINO	\N	Cagayan Valley	Batanes	Basco	Ihubok I	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	PERSONAL	2026-03-15 15:01:42.573657	\N	020000000	020900000	020901000	020901002
\.


--
-- Data for Name: crime_modus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.crime_modus (id, blotter_id, modus_reference_id, created_at, updated_at) FROM stdin;
15	2	13	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
16	2	12	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
17	2	9	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
18	2	10	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
19	2	13	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
20	2	12	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
21	2	9	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
22	2	10	2026-03-08 00:56:10.345062	2026-03-08 00:56:10.345062
24	5	17	2026-03-09 20:23:55.67447	2026-03-09 20:23:55.67447
25	108	26	2026-03-09 20:24:47.493024	2026-03-09 20:24:47.493024
32	1	15	2026-03-10 15:46:52.083373	2026-03-10 15:46:52.083373
33	1	16	2026-03-10 15:46:52.083373	2026-03-10 15:46:52.083373
47	124	32	2026-03-14 20:58:09.072312	2026-03-14 20:58:09.072312
48	123	13	2026-03-14 22:10:36.311474	2026-03-14 22:10:36.311474
50	77	17	2026-03-15 13:38:17.893595	2026-03-15 13:38:17.893595
53	125	12	2026-03-15 13:42:29.536826	2026-03-15 13:42:29.536826
54	126	13	2026-03-15 15:01:42.573657	2026-03-15 15:01:42.573657
\.


--
-- Data for Name: crime_modus_reference; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.crime_modus_reference (id, crime_type, modus_name, created_at, description, is_active, updated_at) FROM stdin;
1	PHYSICAL INJURIES	Chemicals	2026-03-07 07:09:04.691655	Use of corrosive or harmful chemical substances to inflict physical injury on the victim.	t	2026-03-07 07:09:04.691655
2	PHYSICAL INJURIES	Choking	2026-03-07 07:09:04.691655	Applying pressure to the throat or neck to restrict breathing and cause physical harm.	t	2026-03-07 07:09:04.691655
3	PHYSICAL INJURIES	Hitting with hard object	2026-03-07 07:09:04.691655	Striking the victim using a blunt or hard object such as a rock, bat, or similar weapon.	t	2026-03-07 07:09:04.691655
4	PHYSICAL INJURIES	Mauling	2026-03-07 07:09:04.691655	Group or individual attack involving repeated striking, kicking, or beating of the victim.	t	2026-03-07 07:09:04.691655
5	PHYSICAL INJURIES	Punching	2026-03-07 07:09:04.691655	Inflicting injury through direct fist strikes to the body or face of the victim.	t	2026-03-07 07:09:04.691655
6	PHYSICAL INJURIES	Stabbing	2026-03-07 07:09:04.691655	Use of a bladed or pointed weapon to penetrate and wound the victim.	t	2026-03-07 07:09:04.691655
9	HOMICIDE	Stabbing	2026-03-07 07:09:04.691655	Use of a bladed weapon resulting in the death of the victim.	t	2026-03-07 07:09:04.691655
10	HOMICIDE	Strangulation	2026-03-07 07:09:04.691655	Death caused by compressing the throat or neck, cutting off air or blood supply.	t	2026-03-07 07:09:04.691655
11	MURDER	Burning	2026-03-07 07:09:04.691655	Deliberate use of fire to kill the victim, often with qualifying circumstances such as cruelty.	t	2026-03-07 07:09:04.691655
12	MURDER	Hacking	2026-03-07 07:09:04.691655	Use of a large bladed weapon such as a bolo or machete to inflict fatal wounds.	t	2026-03-07 07:09:04.691655
13	MURDER	Hitting with hard object	2026-03-07 07:09:04.691655	Intentional fatal striking of the victim using a blunt instrument with qualifying circumstances.	t	2026-03-07 07:09:04.691655
15	MURDER	Shooting	2026-03-07 07:09:04.691655	Use of a firearm to deliberately kill the victim under qualifying circumstances.	t	2026-03-07 07:09:04.691655
16	MURDER	Stabbing	2026-03-07 07:09:04.691655	Intentional use of a bladed weapon to kill the victim with qualifying circumstances such as treachery.	t	2026-03-07 07:09:04.691655
17	RAPE	Deprived of Reason or Unconscious (Under the influence of alcohol/drugs)	2026-03-07 07:09:04.691655	Victim was rendered unable to resist or consent due to intoxication from alcohol or drugs administered by or taken with the offender.	t	2026-03-07 07:09:04.691655
18	RAPE	Force/threat/intimidation	2026-03-07 07:09:04.691655	Offender used physical force, threats, or intimidation to compel the victim to submit to the sexual act against their will.	t	2026-03-07 07:09:04.691655
19	ROBBERY	Akyat Bahay	2026-03-07 07:09:04.691655	Offender gains unlawful entry into a residence by climbing through windows, rooftops, or walls to commit robbery.	t	2026-03-07 07:09:04.691655
20	ROBBERY	Baklas bubong/dingding	2026-03-07 07:09:04.691655	Forcible removal or destruction of roofing or wall materials to gain unauthorized entry into a structure.	t	2026-03-07 07:09:04.691655
21	ROBBERY	Bolt cutter	2026-03-07 07:09:04.691655	Use of a bolt cutter or similar tool to break through locks, chains, or gates to commit robbery.	t	2026-03-07 07:09:04.691655
22	ROBBERY	Hold-up w/ gun	2026-03-07 07:09:04.691655	Armed robbery where the offender uses a firearm to threaten and rob the victim.	t	2026-03-07 07:09:04.691655
23	ROBBERY	Hold-up w/ knife	2026-03-07 07:09:04.691655	Armed robbery where the offender uses a bladed weapon to threaten and rob the victim.	t	2026-03-07 07:09:04.691655
24	THEFT	Akyat Bahay	2026-03-07 07:09:04.691655	Offender climbs through windows, rooftops, or walls to gain entry and commit theft without force or violence.	t	2026-03-07 07:09:04.691655
25	THEFT	Applied as helper	2026-03-07 07:09:04.691655	Offender poses as a domestic helper or laborer to gain access to the property and steal valuables.	t	2026-03-07 07:09:04.691655
26	THEFT	Pickpocketing	2026-03-07 07:09:04.691655	Offender stealthily removes valuables such as wallets or phones from the victim's person without their knowledge.	t	2026-03-07 07:09:04.691655
27	THEFT	Salisi	2026-03-07 07:09:04.691655	Offender distracts the victim while an accomplice steals their belongings, commonly in public places.	t	2026-03-07 07:09:04.691655
28	THEFT	Shoplifting	2026-03-07 07:09:04.691655	Theft of merchandise from a retail establishment by concealing items without payment.	t	2026-03-07 07:09:04.691655
29	THEFT	Stolen while unattended	2026-03-07 07:09:04.691655	Valuables are taken while the owner temporarily leaves them unattended in a public or semi-public area.	t	2026-03-07 07:09:04.691655
34	SPECIAL COMPLEX CRIME	Hold-up w/ gun	2026-03-07 07:09:04.691655	Armed hold-up using a firearm resulting in a composite crime such as Robbery with Homicide.	t	2026-03-07 07:09:04.691655
35	SPECIAL COMPLEX CRIME	Hold-up w/ knife	2026-03-07 07:09:04.691655	Armed hold-up using a bladed weapon resulting in the commission of a special complex crime.	t	2026-03-07 07:09:04.691655
33	SPECIAL COMPLEX CRIME	Akyat Bahay	2026-03-07 07:09:04.691655	Entry through climbing that leads to a composite crime such as Robbery with Rape or Robbery with Homicide.	t	2026-03-07 15:10:43.807289
32	CARNAPPING - MV	Stolen While Parked Unattended (SWPU)	2026-03-07 07:09:04.691655	Vehicle is stolen while left parked and unattended by the owner in a public or private area.	f	2026-03-15 05:24:56.634006
8	HOMICIDE	Punching	2026-03-07 07:09:04.691655	Death resulting from repeated or forceful fist strikes to the victim.	t	2026-03-15 06:18:51.034767
\.


--
-- Data for Name: mobile_unit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mobile_unit (mobile_unit_id, mobile_unit_name, barangay_area, created_by, created_at, updated_at) FROM stdin;
6	mb 1	Brgy. Aguinaldo, Brgy. Alima, Brgy. Aniban III, Brgy. Banalo, Brgy. Habay I	d51e03c6-0f15-4563-ad0c-4aa26edc0f13	2026-03-15 20:01:59.678433	2026-03-16 01:28:11.66331
\.


--
-- Data for Name: mobile_unit_patroller; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mobile_unit_patroller (id, mobile_unit_id, active_patroller_id, assigned_at) FROM stdin;
32	6	18	2026-03-16 01:28:11.66331
\.


--
-- Data for Name: offenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.offenses (offense_id, blotter_id, is_principal_offense, offense_name, stage_of_felony, index_type, investigator_on_case, most_investigator, modus, created_at) FROM stdin;
7	2	t	Murder	COMPLETED	Index	PCO Jeyan	PI Jerome	\N	2026-03-08 00:56:10.345062
8	2	f	Homicide	ATTEMPTED	Index	PCO JErome	PI Jai	\N	2026-03-08 00:56:10.345062
11	6	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
12	7	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
13	8	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
14	9	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
15	10	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
16	11	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
17	12	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
18	13	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
19	14	t	Special Complex Crime	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
20	15	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
21	16	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
22	17	t	Special Complex Crime	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
23	18	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
24	19	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
25	20	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
26	21	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
27	22	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
28	23	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
29	24	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
30	25	t	NEW ANTI-CARNAPPING ACT OF 2016 - MC	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
31	26	t	NEW ANTI-CARNAPPING ACT OF 2016 - MC	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
32	27	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
33	28	t	Homicide	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
34	29	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
35	30	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
36	31	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
37	32	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
38	33	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
39	34	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
40	35	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
41	36	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
42	37	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
43	38	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
44	39	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
45	40	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
46	41	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
47	42	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
48	43	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
49	44	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
50	45	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
51	46	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
52	47	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
53	48	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
54	49	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
55	50	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
56	51	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
57	52	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
58	53	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
59	54	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
60	55	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
61	56	t	NEW ANTI-CARNAPPING ACT OF 2016 - MC	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
62	57	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
63	58	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
64	59	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
65	60	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
66	61	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
67	62	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
68	63	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
69	64	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
70	65	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
71	66	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
72	67	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
73	68	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
74	69	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
75	70	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
76	71	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
77	72	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
78	73	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
79	74	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
80	75	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
81	76	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
83	78	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
84	79	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
85	80	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
86	81	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
87	82	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
88	83	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
89	84	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
90	85	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
91	86	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
92	87	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
93	88	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
94	89	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
95	90	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
96	91	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
97	92	t	Homicide	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
98	93	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
99	94	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
100	95	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
101	96	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
102	97	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
103	98	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
104	99	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
105	100	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
106	101	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
107	102	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
108	103	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
109	104	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
110	105	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
111	106	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
112	107	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
114	109	t	Physical Injury	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
115	110	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
116	111	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
117	112	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
118	113	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
119	114	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
120	115	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
121	116	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
122	117	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
123	118	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
124	119	t	Robbery	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
125	120	t	Murder	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
126	121	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
127	122	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 12:20:20.816739
128	5	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 20:23:55.67447
129	108	t	Theft	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-09 20:24:47.493024
136	1	t	Murder	COMPLETED	Index	PCO  Shanna	PI Jeyan	\N	2026-03-10 15:46:52.083373
149	124	t	Carnapping - MV	COMPLETED	Index	PCO Roger	PI John	\N	2026-03-14 20:58:09.072312
150	123	t	Murder	COMPLETED	Index	PCO Roger	PI John	\N	2026-03-14 22:10:36.311474
152	77	t	Rape	COMPLETED	Index	PNP Bacoor Investigator	PNP Bacoor Most Investigator	\N	2026-03-15 13:38:17.893595
155	125	t	Murder	COMPLETED	Index	PCO Vhong	PI John	\N	2026-03-15 13:42:29.536826
156	126	t	Murder	COMPLETED	Index	ffffffff	fffffff	\N	2026-03-15 15:01:42.573657
\.


--
-- Data for Name: otp_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.otp_requests (email, otp_hash, expires_at, request_count, last_request_at) FROM stdin;
jairus.oicali@gmail.com	$2b$10$Ix4nag/eN77DNxn91LBopetFTd27otR7M0opOyDpIniDppSeFGzM6	2026-03-13 09:54:04.972385	2	2026-03-13 09:52:04.972385
\.


--
-- Data for Name: police_details; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.police_details (user_id, rank, mobile_patrol, department) FROM stdin;
7efe5243-7c20-40b0-b85d-f6501cd4ca8b	\N	\N	\N
e81ed4a5-8453-4da1-a694-b6e5dfaf0a9f	\N	\N	\N
0b74f1c5-439e-4f8f-a217-669eb9be21d7	\N	\N	\N
5fc4ec9f-ed72-4bc1-a240-2eaf5d4d9b74	\N	\N	\N
d51e03c6-0f15-4563-ad0c-4aa26edc0f13	\N	\N	\N
4296ae68-e253-4352-9b62-1e3768844ba3	\N	\N	\N
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (role_id, role_name, user_type) FROM stdin;
1	Administrator	police
2	Investigator	police
3	Patrol	police
4	Barangay	barangay
\.


--
-- Data for Name: suspects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suspects (suspect_id, blotter_id, first_name, middle_name, last_name, qualifier, alias, gender, birthday, age, birth_place, nationality, region, district_province, city_municipality, barangay, house_street, status, location_if_arrested, degree_participation, relation_to_victim, educational_attainment, height_cm, drug_used, motive, created_at, occupation, region_code, province_code, municipality_code, barangay_code) FROM stdin;
6	2	Slenderina	\N	Achuchina	Jr.	\N	Male	\N	20	\N	FILIPINO	NCR	Cavite	Dasmariñas	Fatima 1-k	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	At Large	\N	Accomplice	\N	\N	\N	f	\N	2026-03-08 00:56:10.345062	Ninja	\N	\N	\N	\N
9	6	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
10	7	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
11	8	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
12	9	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
13	10	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
14	11	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
15	12	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
16	13	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
17	14	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
18	15	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	LIGAS I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
19	16	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SALINAS I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
20	17	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
21	18	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
22	19	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
23	20	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	LIGAS II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
24	21	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
25	22	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
26	23	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
27	24	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
28	25	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW EAST	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
29	26	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
30	27	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW EAST	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
31	28	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
32	29	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
33	30	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
34	31	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
35	32	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	REAL I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
36	33	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
37	34	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
38	35	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU V	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
39	36	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
40	37	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
41	38	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
42	39	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
43	40	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
44	41	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MALIKSI I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
45	42	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	BANALO	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
46	43	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
47	44	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU I (PANAPAAN)	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
48	45	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
49	46	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
50	47	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW WEST	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
51	48	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU I (PANAPAAN)	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
52	49	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU VI	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
53	50	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
54	51	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SINEGUELASAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
55	52	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
56	53	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
57	54	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
58	55	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
59	56	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
60	57	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
61	58	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
62	59	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
63	60	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
64	61	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
65	62	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
66	63	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
67	64	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
68	65	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
69	66	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
70	67	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
71	68	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
72	69	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
73	70	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VII	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
74	71	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
75	72	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VII	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
76	73	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	QUEENS ROW CENTRAL	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
77	74	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
78	75	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
79	76	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MAMBOG I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
81	78	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
82	79	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
83	80	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
84	81	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
85	82	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
86	83	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
87	84	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SINEGUELASAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
88	85	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
89	86	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
90	87	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
91	88	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
92	89	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
93	90	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VI	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
94	91	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
95	92	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
96	93	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ZAPOTE III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
97	94	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
98	95	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
99	96	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ANIBAN I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
100	97	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	ANIBAN I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
101	98	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MABOLO I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
102	99	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
103	100	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	DULONG BAYAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
104	101	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
105	102	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	NIOG I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
106	103	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
107	104	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA I	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
108	105	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
109	106	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
110	107	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
112	109	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	P.F. ESPIRITU III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
113	110	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	BAYANAN	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
114	111	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	TALABA VI	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
115	112	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
116	113	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
117	114	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO VI	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
118	115	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
119	116	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MALIKSI II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
120	117	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO V	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
121	118	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
122	119	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
123	120	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	SAN NICOLAS III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
124	121	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	HABAY II	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
125	122	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 12:20:14.104858	\N	\N	\N	\N	\N
126	5	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO III	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 20:23:55.67447	\N	\N	\N	\N	\N
127	108	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Region IV-A (CALABARZON)	Cavite	Bacoor City	MOLINO IV	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-09 20:24:47.493024	\N	\N	\N	\N	\N
134	1	Jr	Mayuga	Gopela	\N	\N	Male	\N	\N	\N	FILIPINO	NCR	Cavite	Dasmariñas	Fatima 1-k	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-10 15:46:52.083373	\N	\N	\N	\N	\N
147	124	Jerome	\N	Gopela	\N	\N	Female	\N	\N	\N	FILIPINO	CALABARZON	Cavite	General Emilio Aguinaldo	Narvaez	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-14 20:58:09.072312	\N	040000000	042100000	042107000	042107009
148	123	Jerome	\N	Gopela	\N	\N	Male	\N	\N	\N	FILIPINO	Davao Region	Davao De Oro	Laak	Cebulida	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-14 22:10:36.311474	\N	110000000	118200000	118202000	118202004
150	77	Unknown	\N	Suspect	\N	\N	Male	\N	\N	\N	FILIPINO	Eastern Visayas	Biliran	Biliran	Busali	Bacoor City Cavite	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-15 13:38:17.893595	\N	080000000	087800000	087802000	087802003
153	125	Jerome	\N	Gopela	\N	\N	Male	\N	\N	\N	FILIPINO	MIMAROPA Region	Occidental Mindoro	Looc	Balikyas	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-15 13:42:29.536826	\N	170000000	175100000	175103000	175103003
154	126	Jerome	\N	Gopela	\N	\N	Male	\N	\N	\N	FILIPINO	BARMM	Lanao Del Sur	Calanogas	Piksan	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1	At Large	\N	Principal	\N	\N	\N	f	\N	2026-03-15 15:01:42.573657	\N	150000000	153600000	153632000	153632048
\.


--
-- Data for Name: tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tokens (token_id, user_id, token_hash, expires_at, is_revoked, revoked_at, created_at) FROM stdin;
e4fa3780-f11a-4adc-8a80-672a029210f0	0b74f1c5-439e-4f8f-a217-669eb9be21d7	3d42c6df445c9119281e23ab1a03de071942748c9ddb9284b560e717547453da	2026-03-19 17:11:45.513	f	\N	2026-03-18 17:11:45.29396
ad5b10d2-1685-42b2-abed-a3dedf5e772f	0b74f1c5-439e-4f8f-a217-669eb9be21d7	a0e8dcd877e1436f2a322d9a9c7f4be0edaf2564a0895943283413d62b0a6447	2026-03-20 13:04:22.803	f	\N	2026-03-19 13:04:23.187453
a7499b3e-7274-4988-b520-b86f96afa20f	0b74f1c5-439e-4f8f-a217-669eb9be21d7	fd8f68f93f2d14bb25caf110611013e31ed4e25b76463bf1b8285fb7e1d65a5f	2026-03-20 06:37:51.378	f	\N	2026-03-19 06:37:51.341673
b2c2212b-196f-4d3a-8010-1b8d4a3a1d22	0b74f1c5-439e-4f8f-a217-669eb9be21d7	9978c1bd481a2e266687f64d7d127212c83e3b7ddde80807c4459ed3e07d8666	2026-03-20 09:41:22.241	f	\N	2026-03-19 09:41:22.384419
8c9e8314-4cef-4f08-b7f1-a713b5fafef4	0b74f1c5-439e-4f8f-a217-669eb9be21d7	cf5a3e69d3ee1f1e967d9b314ccb89d0dcd4e5f9ffe3756c9415dd4754491088	2026-03-20 14:48:12.802	f	\N	2026-03-19 14:48:13.299994
\.


--
-- Data for Name: user_addresses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_addresses (address_id, user_id, region_code, province_code, municipality_code, barangay_code, address_line) FROM stdin;
41	d51e03c6-0f15-4563-ad0c-4aa26edc0f13	040000000	042100000	042103000	042103004	\N
56	d72fc8a3-a824-4d26-838d-9c4891fa2268	040000000	042100000	042103000	042103001	\N
48	4296ae68-e253-4352-9b62-1e3768844ba3	040000000	042100000	042103000	042103065	\N
1	7efe5243-7c20-40b0-b85d-f6501cd4ca8b	020000000	021500000	021520000	021520015	Blk. A-10 Lot 7
17	0b74f1c5-439e-4f8f-a217-669eb9be21d7	040000000	042100000	042103000	042103046	Blk 1 Lot 8C Guyabano St. Phase III West Camella Springville
188	e81ed4a5-8453-4da1-a694-b6e5dfaf0a9f	040000000	043400000	043409000	043409001	Eldia
57	93dbf76c-e52f-41b3-9e2f-604b1085ea3b	040000000	042100000	042103000	042103005	\N
162	9e3bc50b-1638-4a44-8b78-e7217dd12131	040000000	042100000	042103000	042103045	Dasmarinas City Cavite Fatima 1-k Blk 12 Lot 21 Dapdap St. Phase 1
151	5fc4ec9f-ed72-4bc1-a240-2eaf5d4d9b74	020000000	021500000	021502000	021502002	Blk. C8 lot 6d
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (user_id, username, password, email, first_name, last_name, middle_name, suffix, phone, alternate_phone, gender, date_of_birth, role_id, user_type, profile_picture, status, lockout_until, failed_login_attempts, last_login, created_by, created_at, updated_at, email_changed_at, password_changed_at, pw_change_count, pw_window_start) FROM stdin;
93dbf76c-e52f-41b3-9e2f-604b1085ea3b	BB26002_brgy	$2b$10$nd0FX.WMAbtO/LbfJVqxSe30NfuKk3lqjo8Fo..fil/npj8s092W6	test@gmail.com	Beta	Barangayssss	\N		+639898989898	\N	Male	2008-02-26	4	barangay	https://res.cloudinary.com/bantay/image/upload/v1772277090/profiles/93dbf76c-e52f-41b3-9e2f-604b1085ea3b.jpg	unverified	\N	0	\N	\N	2026-02-28 19:11:24.851344	2026-03-12 15:33:02.653828	\N	\N	0	\N
9e3bc50b-1638-4a44-8b78-e7217dd12131	GJM26003_brgy	$2b$10$VeZQ9ZVltjNOlsDjfnqZ6.16mom6nyi40QKNwOYtwS.Ftbv5U9ViO	jeromegopela@gmail.com	Jr	Gopela	Mayuga	\N	+639111111111	\N	Male	2005-02-22	4	barangay	https://res.cloudinary.com/bantay/image/upload/v1772950151/profiles/9e3bc50b-1638-4a44-8b78-e7217dd12131.jpg	active	\N	0	2026-03-08 14:22:31.631491	\N	2026-03-08 14:09:05.483674	2026-03-12 15:33:02.653828	\N	\N	0	\N
4296ae68-e253-4352-9b62-1e3768844ba3	IB26004_pnp	$2b$10$vXCN1tBfrZbMG44VdBfRRO2ouU975zDmL9GLVCgS0xJrb/0j4SoZa	betainvestigator@gmail.com	Beta	Cat investigator	\N		+639112384091	+639882411827	Male	2008-02-26	2	police	https://res.cloudinary.com/bantay/image/upload/v1772276543/profiles/4296ae68-e253-4352-9b62-1e3768844ba3.jpg	active	\N	1	\N	\N	2026-02-27 22:42:46.871322	2026-03-14 12:27:09.700741	\N	\N	0	\N
d72fc8a3-a824-4d26-838d-9c4891fa2268	BB26001_brgy	$2b$10$oz516Bt1KMbKiG7gSk3fmOz5.FFA81q/KNXBa.HEOK18l6xzVw1eK	brngy@gmail.com	Beta	Barangay	\N		+639999999999	\N	Female	2008-02-27	4	barangay	https://res.cloudinary.com/bantay/image/upload/v1772276685/profiles/d72fc8a3-a824-4d26-838d-9c4891fa2268.jpg	unverified	\N	0	\N	\N	2026-02-28 19:04:39.856643	2026-03-13 10:21:54.221721	\N	\N	0	\N
e81ed4a5-8453-4da1-a694-b6e5dfaf0a9f	YE26006_pnp	$2b$10$QBU3bJNYreTK7VlhIs951u6KvBFLi5phFnoPoNoqcecjrvbuehJ0W	erenaot@gmail.com	Eren	Yeager	\N		+639182374981	\N	Male	2008-03-12	2	police	https://res.cloudinary.com/bantay/image/upload/v1773447978/profiles/e81ed4a5-8453-4da1-a694-b6e5dfaf0a9f.png	unverified	\N	0	\N	\N	2026-03-14 08:26:12.169008	2026-03-15 06:13:48.804391	\N	\N	0	\N
0b74f1c5-439e-4f8f-a217-669eb9be21d7	IJM26002_pnp	$2b$12$9KtqReDLqoSxLtk8rPeiu.xogk13V3QRMgLhnTBu34.ERe3Wi7ELe	jairus.oicali@gmail.com	Jairus Miguel	Ilacio	Boco	\N	+639763977308	+639053002778	Male	2003-10-05	1	police	https://res.cloudinary.com/bantay/image/upload/v1773390824/profiles/0b74f1c5-439e-4f8f-a217-669eb9be21d7.jpg	active	\N	0	2026-03-19 14:48:13.2096	\N	2026-02-27 16:30:16.355258	2026-03-19 14:48:13.2096	\N	2026-03-12 23:54:27.1239+00	0	\N
5fc4ec9f-ed72-4bc1-a240-2eaf5d4d9b74	SS26005_pnp	$2b$12$p9H/gKXbqQa1x3Tqr09DDuYdTq56IOmoL8UBC.SlG4uGQ4zyuiB6G	shannarts05@gmail.com	Shanna audrey	Salitorno	Engalla		+639981915200	+639293562538	Female	2005-03-05	1	police	https://res.cloudinary.com/bantay/image/upload/v1773490006/profiles/5fc4ec9f-ed72-4bc1-a240-2eaf5d4d9b74.jpg	active	\N	0	2026-03-15 22:16:13.203874	\N	2026-03-07 20:57:55.006039	2026-03-15 22:16:13.203874	2026-03-09 16:59:09.44475+00	2026-03-10 07:10:57.707084+00	0	\N
7efe5243-7c20-40b0-b85d-f6501cd4ca8b	BA26001_pnp	$2b$12$PBSm2s.ENw3nwclyqgzsu.H2OAV4tvEZyLw37TCbrBVFbBmzRV2ES	invsysmarkitbot@gmail.com	Beta	Admin	\N	Jr.	+639981915441	+639940280715	Male	2003-10-05	1	police	https://res.cloudinary.com/bantay/image/upload/v1772869172/profiles/7efe5243-7c20-40b0-b85d-f6501cd4ca8b.jpg	active	\N	0	2026-03-16 20:19:56.835301	\N	2026-02-26 14:33:31.452858	2026-03-16 20:19:56.835301	\N	\N	0	\N
d51e03c6-0f15-4563-ad0c-4aa26edc0f13	PB26003_pnp	$2b$10$G.vqxr9bPHrS1DmZDKqlme/2l1zwx2sM8QaVin3HuluhlZoM0AlM6	betapatrol@gmail.com	Beta	Patrol	\N		+639093509123	\N	Male	2008-02-26	3	police	https://res.cloudinary.com/bantay/image/upload/v1772276576/profiles/d51e03c6-0f15-4563-ad0c-4aa26edc0f13.jpg	active	\N	0	2026-03-15 18:59:43.176516	\N	2026-02-27 22:09:19.030958	2026-03-15 18:59:43.176516	\N	\N	0	\N
\.


--
-- Name: active_patroller_active_patroller_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.active_patroller_active_patroller_id_seq', 18, true);


--
-- Name: barangay_map_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.barangay_map_data_id_seq', 50, true);


--
-- Name: blotter_entries_blotter_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.blotter_entries_blotter_id_seq', 126, true);


--
-- Name: case_notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.case_notes_id_seq', 3, true);


--
-- Name: cases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cases_id_seq', 7, true);


--
-- Name: complainants_complainant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.complainants_complainant_id_seq', 156, true);


--
-- Name: crime_modus_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.crime_modus_id_seq', 54, true);


--
-- Name: crime_modus_reference_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.crime_modus_reference_id_seq', 38, true);


--
-- Name: mobile_unit_mobile_unit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mobile_unit_mobile_unit_id_seq', 6, true);


--
-- Name: mobile_unit_patroller_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mobile_unit_patroller_id_seq', 32, true);


--
-- Name: offenses_offense_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.offenses_offense_id_seq', 156, true);


--
-- Name: roles_role_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_role_id_seq', 4, true);


--
-- Name: suspects_suspect_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.suspects_suspect_id_seq', 154, true);


--
-- Name: user_addresses_address_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_addresses_address_id_seq', 191, true);


--
-- Name: active_patroller active_patroller_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_patroller
    ADD CONSTRAINT active_patroller_pkey PRIMARY KEY (active_patroller_id);


--
-- Name: barangay_details barangay_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.barangay_details
    ADD CONSTRAINT barangay_details_pkey PRIMARY KEY (user_id);


--
-- Name: barangay_map_data barangay_map_data_name_db_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.barangay_map_data
    ADD CONSTRAINT barangay_map_data_name_db_key UNIQUE (name_db);


--
-- Name: barangay_map_data barangay_map_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.barangay_map_data
    ADD CONSTRAINT barangay_map_data_pkey PRIMARY KEY (id);


--
-- Name: blotter_entries blotter_entries_blotter_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blotter_entries
    ADD CONSTRAINT blotter_entries_blotter_entry_number_key UNIQUE (blotter_entry_number);


--
-- Name: blotter_entries blotter_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blotter_entries
    ADD CONSTRAINT blotter_entries_pkey PRIMARY KEY (blotter_id);


--
-- Name: case_notes case_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes
    ADD CONSTRAINT case_notes_pkey PRIMARY KEY (id);


--
-- Name: cases cases_blotter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_blotter_id_key UNIQUE (blotter_id);


--
-- Name: cases cases_case_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_case_number_key UNIQUE (case_number);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: complainants complainants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complainants
    ADD CONSTRAINT complainants_pkey PRIMARY KEY (complainant_id);


--
-- Name: crime_modus crime_modus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crime_modus
    ADD CONSTRAINT crime_modus_pkey PRIMARY KEY (id);


--
-- Name: crime_modus_reference crime_modus_reference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crime_modus_reference
    ADD CONSTRAINT crime_modus_reference_pkey PRIMARY KEY (id);


--
-- Name: mobile_unit mobile_unit_mobile_unit_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit
    ADD CONSTRAINT mobile_unit_mobile_unit_name_key UNIQUE (mobile_unit_name);


--
-- Name: mobile_unit_patroller mobile_unit_patroller_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit_patroller
    ADD CONSTRAINT mobile_unit_patroller_pkey PRIMARY KEY (id);


--
-- Name: mobile_unit mobile_unit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit
    ADD CONSTRAINT mobile_unit_pkey PRIMARY KEY (mobile_unit_id);


--
-- Name: offenses offenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offenses
    ADD CONSTRAINT offenses_pkey PRIMARY KEY (offense_id);


--
-- Name: otp_requests otp_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_requests
    ADD CONSTRAINT otp_requests_pkey PRIMARY KEY (email);


--
-- Name: police_details police_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.police_details
    ADD CONSTRAINT police_details_pkey PRIMARY KEY (user_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: suspects suspects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suspects
    ADD CONSTRAINT suspects_pkey PRIMARY KEY (suspect_id);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (token_id);


--
-- Name: tokens tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: crime_modus_reference unique_crime_modus; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crime_modus_reference
    ADD CONSTRAINT unique_crime_modus UNIQUE (crime_type, modus_name);


--
-- Name: mobile_unit_patroller unique_officer_per_unit; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit_patroller
    ADD CONSTRAINT unique_officer_per_unit UNIQUE (mobile_unit_id, active_patroller_id);


--
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (address_id);


--
-- Name: user_addresses user_addresses_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_barangay_details_barangay_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_barangay_details_barangay_code ON public.barangay_details USING btree (barangay_code);


--
-- Name: idx_blotter_date_reported; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blotter_date_reported ON public.blotter_entries USING btree (date_time_reported);


--
-- Name: idx_blotter_entry_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blotter_entry_number ON public.blotter_entries USING btree (blotter_entry_number);


--
-- Name: idx_blotter_incident_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blotter_incident_type ON public.blotter_entries USING btree (incident_type);


--
-- Name: idx_blotter_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blotter_status ON public.blotter_entries USING btree (status);


--
-- Name: idx_complainant_blotter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complainant_blotter ON public.complainants USING btree (blotter_id);


--
-- Name: idx_offense_blotter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offense_blotter ON public.offenses USING btree (blotter_id);


--
-- Name: idx_otp_requests_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_requests_email ON public.otp_requests USING btree (email);


--
-- Name: idx_otp_requests_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_requests_expires_at ON public.otp_requests USING btree (expires_at);


--
-- Name: idx_police_details_mobile_patrol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_police_details_mobile_patrol ON public.police_details USING btree (mobile_patrol);


--
-- Name: idx_suspect_blotter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suspect_blotter ON public.suspects USING btree (blotter_id);


--
-- Name: idx_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_expires_at ON public.tokens USING btree (expires_at);


--
-- Name: idx_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_token_hash ON public.tokens USING btree (token_hash);


--
-- Name: idx_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_user_id ON public.tokens USING btree (user_id);


--
-- Name: idx_user_addresses_barangay_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_addresses_barangay_code ON public.user_addresses USING btree (barangay_code);


--
-- Name: idx_user_addresses_municipality_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_addresses_municipality_code ON public.user_addresses USING btree (municipality_code);


--
-- Name: idx_user_addresses_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_addresses_user_id ON public.user_addresses USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role_id ON public.users USING btree (role_id);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_user_type ON public.users USING btree (user_type);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: users trigger_auto_add_patroller; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_add_patroller AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.auto_add_patroller();


--
-- Name: users trigger_auto_update_patroller_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_update_patroller_role AFTER UPDATE OF role_id ON public.users FOR EACH ROW EXECUTE FUNCTION public.auto_update_patroller_role();


--
-- Name: otp_requests trigger_cleanup_old_otp_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_cleanup_old_otp_requests AFTER INSERT ON public.otp_requests FOR EACH STATEMENT EXECUTE FUNCTION public.cleanup_old_otp_requests();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: barangay_details barangay_details_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.barangay_details
    ADD CONSTRAINT barangay_details_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: case_notes case_notes_added_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes
    ADD CONSTRAINT case_notes_added_by_id_fkey FOREIGN KEY (added_by_id) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- Name: case_notes case_notes_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes
    ADD CONSTRAINT case_notes_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: cases cases_assigned_io_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_assigned_io_id_fkey FOREIGN KEY (assigned_io_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: cases cases_blotter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_blotter_id_fkey FOREIGN KEY (blotter_id) REFERENCES public.blotter_entries(blotter_id) ON DELETE RESTRICT;


--
-- Name: cases cases_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- Name: complainants complainants_blotter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complainants
    ADD CONSTRAINT complainants_blotter_id_fkey FOREIGN KEY (blotter_id) REFERENCES public.blotter_entries(blotter_id) ON DELETE CASCADE;


--
-- Name: crime_modus crime_modus_blotter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crime_modus
    ADD CONSTRAINT crime_modus_blotter_id_fkey FOREIGN KEY (blotter_id) REFERENCES public.blotter_entries(blotter_id) ON DELETE CASCADE;


--
-- Name: crime_modus crime_modus_modus_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crime_modus
    ADD CONSTRAINT crime_modus_modus_reference_id_fkey FOREIGN KEY (modus_reference_id) REFERENCES public.crime_modus_reference(id) ON DELETE RESTRICT;


--
-- Name: active_patroller fk_active_patroller_officer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_patroller
    ADD CONSTRAINT fk_active_patroller_officer FOREIGN KEY (officer_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: mobile_unit mobile_unit_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit
    ADD CONSTRAINT mobile_unit_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: mobile_unit_patroller mobile_unit_patroller_active_patroller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit_patroller
    ADD CONSTRAINT mobile_unit_patroller_active_patroller_id_fkey FOREIGN KEY (active_patroller_id) REFERENCES public.active_patroller(active_patroller_id) ON DELETE CASCADE;


--
-- Name: mobile_unit_patroller mobile_unit_patroller_mobile_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_unit_patroller
    ADD CONSTRAINT mobile_unit_patroller_mobile_unit_id_fkey FOREIGN KEY (mobile_unit_id) REFERENCES public.mobile_unit(mobile_unit_id) ON DELETE CASCADE;


--
-- Name: offenses offenses_blotter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offenses
    ADD CONSTRAINT offenses_blotter_id_fkey FOREIGN KEY (blotter_id) REFERENCES public.blotter_entries(blotter_id) ON DELETE CASCADE;


--
-- Name: police_details police_details_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.police_details
    ADD CONSTRAINT police_details_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: suspects suspects_blotter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suspects
    ADD CONSTRAINT suspects_blotter_id_fkey FOREIGN KEY (blotter_id) REFERENCES public.blotter_entries(blotter_id) ON DELETE CASCADE;


--
-- Name: tokens tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: users users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 6JmzvTilPaB00y0ku3nFkpyNgmXFBRRLLQ3Suqxa8q3qzp5cHq9NlJ8n3suyy7u

