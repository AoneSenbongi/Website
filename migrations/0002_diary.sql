ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'blog' CHECK(kind IN ('blog','diary'));
ALTER TABLE posts ADD COLUMN entry_date TEXT;
ALTER TABLE posts ADD COLUMN music TEXT;
ALTER TABLE posts ADD COLUMN song TEXT;
CREATE UNIQUE INDEX diary_date ON posts(entry_date) WHERE kind='diary';
