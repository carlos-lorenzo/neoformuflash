-- ============================================================================
-- Seed: the institution taxonomy.
--
-- UPV first (it is where the first students come from), then the largest
-- Spanish universities by enrolment. Anything not on this list goes through
-- institution_requests and a moderator, never straight into this table —
-- see the moderation queue in 0001_foundation.sql.
--
-- Idempotent: `on conflict do nothing` on the slug, so re-running against a
-- populated database is a no-op rather than a duplicate-key failure.
-- ============================================================================

insert into institutions (slug, name, country) values
  ('upv',        'Universitat Politècnica de València',          'ES'),
  ('uned',       'Universidad Nacional de Educación a Distancia', 'ES'),
  ('ucm',        'Universidad Complutense de Madrid',            'ES'),
  ('us',         'Universidad de Sevilla',                       'ES'),
  ('ub',         'Universitat de Barcelona',                     'ES'),
  ('ugr',        'Universidad de Granada',                       'ES'),
  ('uv',         'Universitat de València',                      'ES'),
  ('upm',        'Universidad Politécnica de Madrid',            'ES'),
  ('ehu',        'Universidad del País Vasco / Euskal Herriko Unibertsitatea', 'ES'),
  ('uab',        'Universitat Autònoma de Barcelona',            'ES'),
  ('uma',        'Universidad de Málaga',                        'ES'),
  ('um',         'Universidad de Murcia',                        'ES'),
  ('unizar',     'Universidad de Zaragoza',                      'ES'),
  ('usal',       'Universidad de Salamanca',                     'ES'),
  ('upc',        'Universitat Politècnica de Catalunya',         'ES'),
  ('uc3m',       'Universidad Carlos III de Madrid',             'ES'),
  ('uam',        'Universidad Autónoma de Madrid',               'ES'),
  ('ua',         'Universidad de Alicante',                      'ES'),
  ('uva',        'Universidad de Valladolid',                    'ES'),
  ('usc',        'Universidade de Santiago de Compostela',       'ES'),
  ('uvigo',      'Universidade de Vigo',                         'ES'),
  ('udc',        'Universidade da Coruña',                       'ES'),
  ('uniovi',     'Universidad de Oviedo',                        'ES'),
  ('uca',        'Universidad de Cádiz',                         'ES'),
  ('uco',        'Universidad de Córdoba',                       'ES'),
  ('unex',       'Universidad de Extremadura',                   'ES'),
  ('uji',        'Universitat Jaume I',                          'ES'),
  ('ull',        'Universidad de La Laguna',                     'ES'),
  ('ulpgc',      'Universidad de Las Palmas de Gran Canaria',    'ES'),
  ('uib',        'Universitat de les Illes Balears',             'ES'),
  ('unican',     'Universidad de Cantabria',                     'ES'),
  ('unileon',    'Universidad de León',                          'ES'),
  ('ual',        'Universidad de Almería',                       'ES'),
  ('uhu',        'Universidad de Huelva',                        'ES'),
  ('ujaen',      'Universidad de Jaén',                          'ES'),
  ('umh',        'Universidad Miguel Hernández de Elche',        'ES'),
  ('upo',        'Universidad Pablo de Olavide',                 'ES'),
  ('upct',       'Universidad Politécnica de Cartagena',         'ES'),
  ('urjc',       'Universidad Rey Juan Carlos',                  'ES'),
  ('uah',        'Universidad de Alcalá',                        'ES'),
  ('urv',        'Universitat Rovira i Virgili',                 'ES'),
  ('udg',        'Universitat de Girona',                        'ES'),
  ('udl',        'Universitat de Lleida',                        'ES'),
  ('upf',        'Universitat Pompeu Fabra',                     'ES'),
  ('unavarra',   'Universidad Pública de Navarra',               'ES'),
  ('unirioja',   'Universidad de La Rioja',                      'ES'),
  ('uclm',       'Universidad de Castilla-La Mancha',            'ES'),
  ('ubu',        'Universidad de Burgos',                        'ES'),
  ('unav',       'Universidad de Navarra',                       'ES'),
  ('url',        'Universitat Ramon Llull',                      'ES'),
  ('uoc',        'Universitat Oberta de Catalunya',              'ES'),
  ('deusto',     'Universidad de Deusto',                        'ES'),
  ('comillas',   'Universidad Pontificia Comillas',              'ES'),
  ('uem',        'Universidad Europea de Madrid',                'ES')
on conflict (slug) do nothing;

-- ============================================================================
-- Degrees for UPV only.
--
-- Seeding every degree at 54 universities is a data-entry project, not a
-- migration. The degree list fills in as students from each university arrive;
-- degree_id is nullable precisely so signup is never blocked on it.
-- ============================================================================

insert into degrees (institution_id, slug, name)
select i.id, d.slug, d.name
from institutions i
cross join (values
  ('informatica',       'Grado en Ingeniería Informática'),
  ('datos',             'Grado en Ciencia de Datos'),
  ('teleco',            'Grado en Ingeniería de Tecnologías y Servicios de Telecomunicación'),
  ('industrial',        'Grado en Ingeniería en Tecnologías Industriales'),
  ('aeroespacial',      'Grado en Ingeniería Aeroespacial'),
  ('mecanica',          'Grado en Ingeniería Mecánica'),
  ('electrica',         'Grado en Ingeniería Eléctrica'),
  ('electronica',       'Grado en Ingeniería Electrónica Industrial y Automática'),
  ('quimica',           'Grado en Ingeniería Química'),
  ('civil',             'Grado en Ingeniería Civil'),
  ('biomedica',         'Grado en Ingeniería Biomédica'),
  ('organizacion',      'Grado en Ingeniería de Organización Industrial'),
  ('diseno',            'Grado en Ingeniería en Diseño Industrial y Desarrollo de Productos'),
  ('biotecnologia',     'Grado en Biotecnología'),
  ('arquitectura',      'Grado en Fundamentos de la Arquitectura'),
  ('agroalimentaria',   'Grado en Ingeniería Agroalimentaria y del Medio Rural'),
  ('obras-publicas',    'Grado en Ingeniería de Obras Públicas'),
  ('forestal',          'Grado en Ingeniería Forestal y del Medio Natural')
) as d(slug, name)
where i.slug = 'upv'
on conflict (institution_id, slug) do nothing;
