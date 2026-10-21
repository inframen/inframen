USE inframen;

DELETE FROM horario WHERE nie = '19800492';

INSERT INTO horario (nie, dia_semana, hora_entrada, hora_salida, tolerancia_min)
SELECT '19800492', d, '13:00:00', '17:00:00', 0
FROM (SELECT 1 d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dias;

UPDATE estudiante SET nombres = TRIM(nombres) WHERE nie = '19800492';

USE inframen;
INSERT IGNORE INTO horario (nie, dia_semana, hora_entrada, hora_salida, tolerancia_min)
VALUES ('19800492', 6, '22:00:00', '23:59:00', 0),
       ('19800492', 0, '22:00:00', '23:59:00', 0);
       


USE inframen;

-- 1) Ver qué se va a borrar (opcional)
SELECT nie, nombres, apellidos FROM estudiante
WHERE nie IN ('12345678','23456789','34567890');

-- 2) Primero sus ingresos (las fichas de retardo se borran solas)
DELETE FROM ingreso WHERE nie IN ('12345678','23456789','34567890');

-- 3) Después los estudiantes (sus horarios se borran solos)
DELETE FROM estudiante WHERE nie IN ('12345678','23456789','34567890');


USE inframen;
SELECT COUNT(*) FROM inframen.estudiante;


USE inframen;
SET SQL_SAFE_UPDATES = 0;
UPDATE ficha_retardo
   SET observacion = NULLIF(TRIM(REPLACE(observacion, '[ajuste manual]', '')), '')
 WHERE observacion LIKE '%[ajuste manual]%';