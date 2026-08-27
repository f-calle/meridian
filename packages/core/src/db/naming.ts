/** camelCase field name -> snake_case column name. */
export function toColumnName(fieldName: string): string {
  return fieldName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
