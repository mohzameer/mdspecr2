update public.templates
set instructions = replace(
  instructions,
  'Preserve the original spec content at the top, then extract or generate the following sections:',
  'Extract or generate the following sections from the spec:'
)
where is_default = true
  and instructions like '%Preserve the original spec content at the top%';
