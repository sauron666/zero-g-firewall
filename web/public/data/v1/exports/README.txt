Zero-G Firewall: tidy exports of NASA's PSI combustion experimental tables

Source: NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov, fetched on 14 November 2026.
Licence stated on the PSI records: CC0-1.0, not stated.

One CSV per experimental table: one row per test, columns renamed to snake_case (see column_map.json and data_dictionary.csv).
Cells are NASA's text. A dash, 'n/a' or a spreadsheet error value is left empty. Nothing was corrected: see curator_report.json for what a user should know.
Rows are counted as rows after the header with at least one filled cell; 'row' counts them from 1.
oxygen_mole_fraction and pressure_kpa are added where the table states oxygen; pressure is empty where the table gives none. It is never assumed.

tests_long.csv        one line per filled cell: value as text, value as a number when it is one, and its unit
test_conditions.csv   one line per test that states oxygen: series, fuel kind, oxygen, pressure, fuel, outcome as written
data_dictionary.csv   every column of every file: original header, unit, kind, how full, range, notes

Every row carries its entry in the site's ledger (ledger.jsonl), which holds the address, the time and the SHA-256 of the NASA file; the per-table files repeat the SHA-256.
Independent project for NASA Space Apps Challenge 2026. Not endorsed by NASA.
