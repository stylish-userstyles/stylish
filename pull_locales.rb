# Create a file in the same directory called pull_locales_login.rb.
# Contents should be:
#
# Transifex.configure do |config|
#   config.username = 'transifex.username'
#   config.password = 'transifex.password'
# end

require 'transifex'
require_relative 'pull_locales_login'

project_slug = 'stylish'

transifex = Transifex::Client.new
project = transifex.project(project_slug)

project.languages.each do |language|
	code = language.language_code
	code_with_hyphens = code.sub('_', '-')
	puts "Getting locale #{code_with_hyphens}"
	project.resources.each do |resource|
		c = resource.translation(code).content.gsub('\\\\', '\\').gsub('&amp;', '&')
		# transifex likes underscores in locale names, we like hyphens
		c.sub!(code, code_with_hyphens) if code != code_with_hyphens
		file_name = "locale/#{code_with_hyphens}/#{resource.name}"
		puts "Writing resource #{file_name}"
		File.open(file_name, 'w') { |file| file.write(c) }
	end
end
