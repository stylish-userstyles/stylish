# Install transifex-ruby - https://rubygems.org/gems/transifex-ruby
#
# Create a file in the same directory called pull_locales_login.rb.
# Contents should be:
#
# Transifex.configure do |config|
#   config.username = 'transifex.username'
#   config.password = 'transifex.password'
# end

require 'transifex'
require 'fileutils'
require_relative 'pull_locales_login'

project_slug = 'stylish'

transifex = Transifex::Client.new
project = transifex.project(project_slug)

project.languages.each do |language|
	code = language.language_code
	code_with_hyphens = code.sub('_', '-')
	puts "Getting locale #{code_with_hyphens}"
	dir_name = "locale/#{code_with_hyphens}"
	Dir.mkdir(dir_name) if !Dir.exist?(dir_name)
	has_content = false
	project.resources.each do |resource|
		c = resource.translation(code).content.gsub('\\\\', '\\').gsub('&amp;', '&')
		# transifex likes underscores in locale names, we like hyphens
		c.sub!(code, code_with_hyphens) if code != code_with_hyphens
		file_name = "#{dir_name}/#{resource.name}"
		begin
			completed = resource.stats(code).completed
		rescue Transifex::NotFound
			puts "Not found, skipping."
			next
		end
		has_content ||= completed != "0%"
		puts "Writing resource #{file_name}, #{completed} complete."
		File.open(file_name, 'w') { |file| file.write(c) }
	end
	if !has_content
		puts "Locale #{code_with_hyphens} has no content, deleting."
		FileUtils.rm_rf(dir_name)
	end
end
